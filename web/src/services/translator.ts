import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkStringify from 'remark-stringify';
import remarkGfm from 'remark-gfm';
import remarkFrontmatter from 'remark-frontmatter';
import { visit, SKIP } from 'unist-util-visit';
import type { Node } from 'unist';

const SKIP_TYPES = new Set<string>([
  'code',
  'inlineCode',
  'html',
  'yaml',
  'toml',
  'math',
  'mdxjsEsm',
  'mdxFlowExpression',
  'mdxTextExpression'
]);

export interface TranslatorConfig {
  base_url: string;
  api_key: string;
  model: string;
  retry_times: number;
  temperature: number;
  max_tokens: number;
  timeout_ms?: number;
  max_batch_chars: number;
  max_batch_segments: number;
}

export type Glossary = Record<string, string>;

export type ChatMessage = {
  role: string;
  content: string;
};

export type ChatCompletionFunction = (params: {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  temperature: number;
  max_tokens: number;
  timeoutMs?: number;
}) => Promise<string>;

export interface TranslatorLogger {
  error?: (event: string, payload: unknown) => void | Promise<void>;
  warn?: (event: string, payload: unknown) => void | Promise<void>;
}

export type ProgressUpdate = {
  done: number;
  total: number;
};

export type TranslateMarkdownOptions = {
  config: TranslatorConfig;
  glossary: Glossary;
  prompt: string;
  judgePrompt?: string;
  onProgress?: (update: ProgressUpdate) => void;
  chatCompletion: ChatCompletionFunction;
  logger?: TranslatorLogger;
};

type Segment = {
  text: string;
  set: (value: string) => void;
};

type SegmentInput = { id?: number; text?: string } | string;

type NormalizedSegmentItem = {
  id: number;
  text: string;
};

type GlossaryEntry = {
  source: string;
  target: string;
  regex: RegExp;
};

type GlossaryDecision = {
  accept: boolean;
  reason: string;
};

type CountMismatchError = Error & {
  code?: string;
  expected?: number;
  actual?: number;
  missingIds?: number[];
  pendingCount?: number;
  attempts?: number;
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function createTermRegex(term: string): RegExp {
  if (/^[A-Za-z0-9]+$/.test(term)) {
    return new RegExp(`\\b${escapeRegExp(term)}\\b`, 'i');
  }
  return new RegExp(escapeRegExp(term), 'i');
}

function buildGlossaryEntries(glossary: Glossary): GlossaryEntry[] {
  return Object.entries(glossary)
    .filter(([source, target]) => source && target)
    .map(([source, target]) => ({
      source,
      target,
      regex: createTermRegex(source)
    }));
}

function termsInText(text: string, entries: GlossaryEntry[]): GlossaryEntry[] {
  const present: GlossaryEntry[] = [];
  for (const entry of entries) {
    if (entry.regex.test(text)) {
      present.push(entry);
    }
  }
  return present;
}

function collectSegments(tree: Node): Segment[] {
  const segments: Segment[] = [];
  visit(tree, (node) => {
    const typedNode = node as { type: string; value?: string };
    if (SKIP_TYPES.has(typedNode.type)) {
      return SKIP;
    }
    if (typedNode.type === 'text') {
      segments.push({
        text: typedNode.value ?? '',
        set(value) {
          typedNode.value = value;
        }
      });
    }
    return undefined;
  });
  return segments;
}

function buildBatches(
  indices: number[],
  segments: Segment[],
  maxChars: number,
  maxSegments: number
): number[][] {
  const batches: number[][] = [];
  let current: number[] = [];
  let charCount = 0;

  for (const index of indices) {
    const length = segments[index].text.length;
    const exceedsCount = current.length >= maxSegments;
    const exceedsChars = charCount + length > maxChars && current.length > 0;

    if (exceedsCount || exceedsChars) {
      batches.push(current);
      current = [];
      charCount = 0;
    }

    current.push(index);
    charCount += length;
  }

  if (current.length > 0) {
    batches.push(current);
  }

  return batches;
}

function buildUserPayload(params: {
  segments: NormalizedSegmentItem[];
  glossaryEntries: GlossaryEntry[];
  missingEntries?: GlossaryEntry[];
}): {
  source_language: string;
  target_language: string;
  glossary: Array<{ source: string; target: string }>;
  segments: NormalizedSegmentItem[];
  missing_terms?: Array<{ source: string; target: string }>;
} {
  const payload = {
    source_language: 'English',
    target_language: 'Simplified Chinese',
    glossary: params.glossaryEntries.map((entry) => ({
      source: entry.source,
      target: entry.target
    })),
    segments: params.segments
  };

  if (params.missingEntries && params.missingEntries.length > 0) {
    return {
      ...payload,
      missing_terms: params.missingEntries.map((entry) => ({
        source: entry.source,
        target: entry.target
      }))
    };
  }

  return payload;
}

function buildUserMessage(payload: {
  source_language: string;
  target_language: string;
  glossary: Array<{ source: string; target: string }>;
  segments: NormalizedSegmentItem[];
  missing_terms?: Array<{ source: string; target: string }>;
}): string {
  return `INPUT JSON:\n${JSON.stringify(payload, null, 2)}\n\nReturn JSON only with the exact shape: {\"translations\": [{\"id\": <id>, \"text\": <translated>}, ...]}.\n- Include one item for every input segment id.\n- Every segment must be translated to Simplified Chinese.\n- Do not return the original English text unless the segment is only punctuation, symbols, or numbers.`;
}

function buildJudgeUserMessage(payload: { items: Array<Record<string, unknown>> }): string {
  return `INPUT JSON:\n${JSON.stringify(payload, null, 2)}\n\nReturn JSON only with the exact shape: {\"decisions\": [{\"id\": <id>, \"accept\": <true|false>, \"reason\": <string>}, ...]}.`;
}

function normalizeSegmentItems(segments: SegmentInput[]): NormalizedSegmentItem[] {
  return segments.map((segment, index) => {
    if (segment && typeof segment === 'object' && 'text' in segment) {
      return {
        id: segment.id ?? index,
        text: String(segment.text ?? '')
      };
    }
    return {
      id: index,
      text: String(segment ?? '')
    };
  });
}

function parseModelResponse(content: string): unknown {
  let text = content.trim();
  if (text.startsWith('```')) {
    text = text.replace(/^```[a-z]*\n?/i, '').replace(/```$/, '').trim();
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) {
      throw new Error('Failed to parse JSON from model response');
    }
    const slice = text.slice(start, end + 1);
    return JSON.parse(slice) as unknown;
  }
}

function coerceBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', 'yes', 'y', '1'].includes(normalized)) {
      return true;
    }
    if (['false', 'no', 'n', '0'].includes(normalized)) {
      return false;
    }
  }
  return false;
}

function coerceTranslationText(item: unknown): string {
  if (typeof item === 'string') {
    return item;
  }
  if (item && typeof item === 'object') {
    const record = item as { text?: unknown; translation?: unknown; value?: unknown };
    if (typeof record.text === 'string') {
      return record.text;
    }
    if (typeof record.translation === 'string') {
      return record.translation;
    }
    if (typeof record.value === 'string') {
      return record.value;
    }
  }
  return String(item ?? '');
}

function normalizeTranslations(
  parsed: unknown,
  segmentItems: NormalizedSegmentItem[]
): { translations: Array<string | undefined>; missingIds: number[] } {
  const parsedObject = parsed as { translations?: unknown } | null;
  if (!parsedObject || !Array.isArray(parsedObject.translations)) {
    throw new Error('Model response missing translations array');
  }

  const raw = parsedObject.translations;
  const expectedIds = segmentItems.map((item) => item.id);
  const allStrings = raw.every((item) => typeof item === 'string');

  if (allStrings) {
    return {
      translations: raw.map((item) => String(item)),
      missingIds: []
    };
  }

  const byId = new Map<number, string>();
  for (const item of raw) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const record = item as { id?: unknown; index?: unknown; key?: unknown; text?: unknown; translation?: unknown; value?: unknown };
    const id = record.id ?? record.index ?? record.key;
    const text = record.text ?? record.translation ?? record.value;
    if (id === undefined || text === undefined) {
      continue;
    }
    const numericId = Number(id);
    if (!Number.isNaN(numericId)) {
      byId.set(numericId, String(text));
    }
  }

  if (byId.size > 0) {
    const translations = expectedIds.map((id) => byId.get(id));
    const missingIds = expectedIds.filter((_, idx) => translations[idx] === undefined);
    return {
      translations,
      missingIds
    };
  }

  return {
    translations: raw.map(coerceTranslationText),
    missingIds: []
  };
}

function buildCountMismatchError(params: {
  expected: number;
  actual: number;
  missingIds?: number[];
}): CountMismatchError {
  const error = new Error('Model returned incorrect number of translations') as CountMismatchError;
  error.code = 'TRANSLATION_COUNT_MISMATCH';
  error.expected = params.expected;
  error.actual = params.actual;
  if (params.missingIds && params.missingIds.length > 0) {
    error.missingIds = params.missingIds;
  }
  return error;
}

function buildBatchFailedError(params: {
  attempts: number;
  pendingCount: number;
  cause: unknown;
}): CountMismatchError {
  const reason =
    params.cause instanceof Error
      ? params.cause.message
      : String(params.cause ?? 'unknown error');
  const error = new Error(
    `Translation failed for ${params.pendingCount} segments after ${params.attempts} attempts: ${reason}`
  ) as CountMismatchError;
  error.code = 'TRANSLATION_BATCH_FAILED';
  error.pendingCount = params.pendingCount;
  error.attempts = params.attempts;
  return error;
}

function isCountMismatchError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const typedError = error as { code?: string; message?: string };
  if (typedError.code === 'TRANSLATION_COUNT_MISMATCH') {
    return true;
  }
  return Boolean(typedError.message && typedError.message.includes('incorrect number of translations'));
}

function isBatchFailedError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const typedError = error as { code?: string };
  return typedError.code === 'TRANSLATION_BATCH_FAILED';
}

function containsCjk(text: string): boolean {
  return /[\u3400-\u9fff]/.test(text);
}

function englishWordCount(text: string): number {
  const matches = text.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g);
  return matches ? matches.length : 0;
}

function normalizeComparableText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isLikelyNaturalEnglishSegment(text: string): boolean {
  const trimmed = String(text ?? '').trim();
  if (trimmed.length < 30) {
    return false;
  }
  if (containsCjk(trimmed)) {
    return false;
  }
  if (/https?:\/\//i.test(trimmed)) {
    return false;
  }
  const alphaCount = (trimmed.match(/[A-Za-z]/g) || []).length;
  if (alphaCount / trimmed.length < 0.45) {
    return false;
  }
  return englishWordCount(trimmed) >= 6;
}

function isLikelyUntranslatedSegment(source: string, translation: string): boolean {
  if (!isLikelyNaturalEnglishSegment(source)) {
    return false;
  }
  const translated = String(translation ?? '').trim();
  if (!translated) {
    return true;
  }
  if (containsCjk(translated)) {
    return false;
  }

  const sourceNormalized = normalizeComparableText(source);
  const translatedNormalized = normalizeComparableText(translated);
  if (!translatedNormalized) {
    return true;
  }
  if (sourceNormalized === translatedNormalized) {
    return true;
  }

  const sourceWords = sourceNormalized.split(' ').filter(Boolean);
  const translatedWords = translatedNormalized.split(' ').filter(Boolean);
  if (sourceWords.length < 6 || translatedWords.length < 4) {
    return false;
  }

  const sourceSet = new Set(sourceWords);
  let overlap = 0;
  for (const word of translatedWords) {
    if (sourceSet.has(word)) {
      overlap += 1;
    }
  }
  const overlapRatio = overlap / Math.max(sourceWords.length, translatedWords.length);
  return overlapRatio >= 0.85;
}

function unionGlossaryEntries(segmentsTerms: GlossaryEntry[][]): GlossaryEntry[] {
  const map = new Map<string, GlossaryEntry>();
  for (const list of segmentsTerms) {
    for (const entry of list) {
      if (!map.has(entry.source)) {
        map.set(entry.source, entry);
      }
    }
  }
  return Array.from(map.values());
}

function checkGlossary(
  pendingIndices: number[],
  segmentTerms: GlossaryEntry[][],
  translations: string[]
): Map<number, GlossaryEntry[]> {
  const missingMap = new Map<number, GlossaryEntry[]>();

  pendingIndices.forEach((index, pos) => {
    const required = segmentTerms[index];
    if (!required || required.length === 0) {
      return;
    }
    const translated = translations[pos] || '';
    const missing = required.filter((entry) => !translated.includes(entry.target));
    if (missing.length > 0) {
      missingMap.set(index, missing);
    }
  });

  return missingMap;
}

function flattenMissingEntries(missingMap: Map<number, GlossaryEntry[]>): GlossaryEntry[] {
  const map = new Map<string, GlossaryEntry>();
  for (const entries of missingMap.values()) {
    for (const entry of entries) {
      if (!map.has(entry.source)) {
        map.set(entry.source, entry);
      }
    }
  }
  return Array.from(map.values());
}

async function translateBatch(params: {
  segments: SegmentInput[];
  glossaryEntries: GlossaryEntry[];
  missingEntries?: GlossaryEntry[];
  config: TranslatorConfig;
  prompt: string;
  logger?: TranslatorLogger;
  chatCompletion: ChatCompletionFunction;
}): Promise<string[]> {
  const normalizedSegments = normalizeSegmentItems(params.segments);
  const payload = buildUserPayload({
    segments: normalizedSegments,
    glossaryEntries: params.glossaryEntries,
    missingEntries: params.missingEntries
  });

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: params.prompt.trim()
    },
    {
      role: 'user',
      content: buildUserMessage(payload)
    }
  ];

  let content: string;
  try {
    content = await params.chatCompletion({
      baseUrl: params.config.base_url,
      apiKey: params.config.api_key,
      model: params.config.model,
      messages,
      temperature: params.config.temperature,
      max_tokens: params.config.max_tokens,
      timeoutMs: params.config.timeout_ms
    });
  } catch (error) {
    if (params.logger?.error) {
      await params.logger.error('chat_completion_failed', {
        type: 'translation',
        error: (error as Error).message || String(error),
        request: { messages }
      });
    }
    throw error;
  }

  let parsed: unknown;
  try {
    parsed = parseModelResponse(content);
  } catch (error) {
    if (params.logger?.error) {
      await params.logger.error('parse_translation_response_failed', {
        type: 'translation',
        error: (error as Error).message || String(error),
        request: { messages },
        response: content
      });
    }
    throw error;
  }
  const normalized = normalizeTranslations(parsed, normalizedSegments);
  const translations = normalized.translations.map((item) =>
    typeof item === 'string' ? item : String(item ?? '')
  );

  if (normalized.missingIds && normalized.missingIds.length > 0) {
    const error = buildCountMismatchError({
      expected: normalizedSegments.length,
      actual: translations.filter((item) => item !== undefined).length,
      missingIds: normalized.missingIds
    });
    if (params.logger?.error) {
      await params.logger.error('translation_count_mismatch', {
        type: 'translation',
        error: error.message,
        request: { messages },
        response: content
      });
    }
    throw error;
  }

  if (translations.length !== normalizedSegments.length) {
    const error = buildCountMismatchError({
      expected: normalizedSegments.length,
      actual: translations.length
    });
    if (params.logger?.error) {
      await params.logger.error('translation_count_mismatch', {
        type: 'translation',
        error: error.message,
        request: { messages },
        response: content
      });
    }
    throw error;
  }

  if (translations.some((item) => item === undefined)) {
    const error = buildCountMismatchError({
      expected: normalizedSegments.length,
      actual: translations.filter((item) => item !== undefined).length
    });
    if (params.logger?.error) {
      await params.logger.error('translation_count_mismatch', {
        type: 'translation',
        error: error.message,
        request: { messages },
        response: content
      });
    }
    throw error;
  }

  return translations;
}

async function judgeGlossaryTranslations(params: {
  items: Array<Record<string, unknown>>;
  config: TranslatorConfig;
  judgePrompt?: string;
  logger?: TranslatorLogger;
  chatCompletion: ChatCompletionFunction;
}): Promise<Map<number, GlossaryDecision>> {
  if (!params.judgePrompt || params.items.length === 0) {
    return new Map();
  }

  const payload = {
    items: params.items
  };

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: params.judgePrompt.trim()
    },
    {
      role: 'user',
      content: buildJudgeUserMessage(payload)
    }
  ];

  let content: string;
  try {
    content = await params.chatCompletion({
      baseUrl: params.config.base_url,
      apiKey: params.config.api_key,
      model: params.config.model,
      messages,
      temperature: params.config.temperature,
      max_tokens: params.config.max_tokens,
      timeoutMs: params.config.timeout_ms
    });
  } catch (error) {
    if (params.logger?.error) {
      await params.logger.error('chat_completion_failed', {
        type: 'glossary_judge',
        error: (error as Error).message || String(error),
        request: { messages }
      });
    }
    throw new Error(`Glossary judge request failed: ${(error as Error).message}`);
  }

  let parsed: unknown;
  try {
    parsed = parseModelResponse(content);
  } catch (error) {
    if (params.logger?.error) {
      await params.logger.error('parse_judge_response_failed', {
        type: 'glossary_judge',
        error: (error as Error).message || String(error),
        request: { messages },
        response: content
      });
    }
    throw new Error(`Glossary judge response parse failed: ${(error as Error).message}`);
  }
  const parsedObject = parsed as { decisions?: unknown } | null;
  if (!parsedObject || !Array.isArray(parsedObject.decisions)) {
    throw new Error('Judge response missing decisions array');
  }

  const decisions = new Map<number, GlossaryDecision>();
  for (const item of parsedObject.decisions) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const record = item as { id?: unknown; index?: unknown; key?: unknown; accept?: unknown; approve?: unknown; ok?: unknown; reason?: unknown };
    const id = record.id ?? record.index ?? record.key;
    const numericId = Number(id);
    if (Number.isNaN(numericId)) {
      continue;
    }
    decisions.set(numericId, {
      accept: coerceBoolean(record.accept ?? record.approve ?? record.ok),
      reason: typeof record.reason === 'string' ? record.reason : ''
    });
  }

  return decisions;
}

async function translateBatchWithRetries(params: {
  batchIndices: number[];
  segments: Segment[];
  segmentTerms: GlossaryEntry[][];
  config: TranslatorConfig;
  prompt: string;
  judgePrompt?: string;
  translations: string[];
  logger?: TranslatorLogger;
  chatCompletion: ChatCompletionFunction;
}): Promise<void> {
  let pending = [...params.batchIndices];
  let attempt = 0;
  let missingEntries: GlossaryEntry[] = [];
  let lastSuccessful: { pending: number[]; translations: string[] } | null = null;

  while (pending.length > 0 && attempt < params.config.retry_times) {
    attempt += 1;

    const batchSegments = pending.map((index) => ({
      id: index,
      text: params.segments[index].text
    }));
    const batchTerms = pending.map((index) => params.segmentTerms[index]);
    const batchGlossary = unionGlossaryEntries(batchTerms);

    try {
      const batchTranslations = await translateBatch({
        segments: batchSegments,
        glossaryEntries: batchGlossary,
        missingEntries,
        config: params.config,
        prompt: params.prompt,
        logger: params.logger,
        chatCompletion: params.chatCompletion
      });

      if (batchTranslations.length !== batchSegments.length) {
        throw buildCountMismatchError({
          expected: batchSegments.length,
          actual: batchTranslations.length
        });
      }

      lastSuccessful = {
        pending: [...pending],
        translations: batchTranslations
      };

      pending.forEach((index, pos) => {
        params.translations[index] = batchTranslations[pos];
      });

      const missingMap = checkGlossary(pending, params.segmentTerms, batchTranslations);
      const untranslatedIndices = pending.filter((index, pos) =>
        isLikelyUntranslatedSegment(params.segments[index].text, batchTranslations[pos])
      );

      if (untranslatedIndices.length > 0) {
        const sampleIds = untranslatedIndices.slice(0, 5).join(', ');
        const overflow = untranslatedIndices.length > 5 ? ` ... +${untranslatedIndices.length - 5}` : '';
        console.warn(`Detected untranslated English segments. Retrying. Segment ids: ${sampleIds}${overflow}`);
        if (params.logger?.warn) {
          await params.logger.warn('untranslated_segments_detected', {
            count: untranslatedIndices.length,
            segment_ids: untranslatedIndices
          });
        }
      }

      if (missingMap.size > 0) {
        const indexToTranslation = new Map<number, string>();
        pending.forEach((index, pos) => {
          indexToTranslation.set(index, batchTranslations[pos]);
        });

        const judgeItems = Array.from(missingMap.entries()).map(([index, missing]) => ({
          id: index,
          source: params.segments[index].text,
          translation: indexToTranslation.get(index) ?? '',
          missing_terms: missing.map((entry) => ({
            source: entry.source,
            target: entry.target
          }))
        }));

        try {
          const decisions = await judgeGlossaryTranslations({
            items: judgeItems,
            config: params.config,
            judgePrompt: params.judgePrompt,
            logger: params.logger,
            chatCompletion: params.chatCompletion
          });
          if (decisions.size > 0) {
            for (const [index, decision] of decisions.entries()) {
              if (decision && decision.accept) {
                missingMap.delete(index);
              }
            }
          }
        } catch (error) {
          console.warn(`Glossary judge failed. Continuing with retries. Error: ${(error as Error).message}`);
          if (params.logger?.warn) {
            await params.logger.warn('glossary_judge_failed', {
              error: (error as Error).message || String(error),
              items: judgeItems
            });
          }
        }
      }

      const unresolved = new Set<number>([...missingMap.keys(), ...untranslatedIndices]);
      if (unresolved.size === 0) {
        pending = [];
        break;
      }

      missingEntries = flattenMissingEntries(missingMap);
      pending = Array.from(unresolved);

      if (missingEntries.length > 0) {
        const missingList = missingEntries.map((entry) => `${entry.source} -> ${entry.target}`).join(', ');
        console.warn(`Glossary check failed. Retrying. Missing terms: ${missingList}`);
      } else {
        console.warn('Retrying unresolved untranslated segments.');
      }
    } catch (error) {
      if (attempt >= params.config.retry_times) {
        if (isCountMismatchError(error) && params.batchIndices.length > 1) {
          throw error;
        }
        if (!lastSuccessful) {
          const failedError = buildBatchFailedError({
            attempts: params.config.retry_times,
            pendingCount: pending.length,
            cause: error
          });
          if (params.logger?.error) {
            await params.logger.error('translation_batch_failed', {
              error: failedError.message,
              pendingCount: pending.length,
              attempts: params.config.retry_times
            });
          }
          throw failedError;
        }
        console.warn('Translation retries exhausted. Using last available translations.');
        if (params.logger?.warn) {
          await params.logger.warn('translation_retries_exhausted', {
            error: (error as Error).message || String(error),
            pendingCount: pending.length
          });
        }
        pending = [];
        break;
      }
      console.warn(`Translation attempt failed. Retrying. Error: ${(error as Error).message}`);
      if (params.logger?.warn) {
        await params.logger.warn('translation_attempt_failed', {
          error: (error as Error).message || String(error)
        });
      }
    }
  }

  if (pending.length > 0) {
    const untranslatedAfterRetries = pending.filter((index) =>
      isLikelyUntranslatedSegment(params.segments[index].text, params.translations[index])
    );
    if (untranslatedAfterRetries.length > 0) {
      const unresolvedError = buildBatchFailedError({
        attempts: params.config.retry_times,
        pendingCount: untranslatedAfterRetries.length,
        cause: new Error('Some segments remained in English after all retries')
      });
      if (params.logger?.error) {
        await params.logger.error('untranslated_segments_after_retries', {
          error: unresolvedError.message,
          segment_ids: untranslatedAfterRetries
        });
      }
      throw unresolvedError;
    }

    const missingList = missingEntries.map((entry) => `${entry.source} -> ${entry.target}`).join(', ');
    console.warn(`Glossary check failed after retries. Using last available translations. Missing terms: ${missingList}`);
    if (params.logger?.warn) {
      await params.logger.warn('glossary_check_failed_after_retries', {
        missing_terms: missingEntries.map((entry) => ({
          source: entry.source,
          target: entry.target
        }))
      });
    }
  }
}

async function translateSegmentsWithRetries(params: {
  segments: Segment[];
  segmentTerms: GlossaryEntry[][];
  config: TranslatorConfig;
  prompt: string;
  judgePrompt?: string;
  onProgress?: (update: ProgressUpdate) => void;
  logger?: TranslatorLogger;
  chatCompletion: ChatCompletionFunction;
}): Promise<string[]> {
  const translations = new Array<string>(params.segments.length);
  const indices = params.segments
    .map((segment, index) => ({ segment, index }))
    .filter(({ segment }) => segment.text.trim().length > 0)
    .map(({ index }) => index);
  params.segments.forEach((segment, index) => {
    if (segment.text.trim().length === 0) {
      translations[index] = segment.text;
    }
  });
  const totalSegments = indices.length;
  let doneSegments = 0;
  if (params.onProgress) {
    if (totalSegments === 0) {
      params.onProgress({ done: 1, total: 1 });
    } else {
      params.onProgress({ done: 0, total: totalSegments });
    }
  }
  const batches = buildBatches(indices, params.segments, params.config.max_batch_chars, params.config.max_batch_segments);

  for (const batchIndices of batches) {
    try {
      await translateBatchWithRetries({
        batchIndices,
        segments: params.segments,
        segmentTerms: params.segmentTerms,
        config: params.config,
        prompt: params.prompt,
        judgePrompt: params.judgePrompt,
        translations,
        logger: params.logger,
        chatCompletion: params.chatCompletion
      });
      doneSegments += batchIndices.length;
      if (params.onProgress) {
        params.onProgress({ done: doneSegments, total: totalSegments });
      }
    } catch (error) {
      if ((isCountMismatchError(error) || isBatchFailedError(error)) && batchIndices.length > 1) {
        console.warn('Batch translation failed. Retrying with single-segment batches.');
        for (const index of batchIndices) {
          await translateBatchWithRetries({
            batchIndices: [index],
            segments: params.segments,
            segmentTerms: params.segmentTerms,
            config: params.config,
            prompt: params.prompt,
            judgePrompt: params.judgePrompt,
            translations,
            logger: params.logger,
            chatCompletion: params.chatCompletion
          });
          doneSegments += 1;
          if (params.onProgress) {
            params.onProgress({ done: doneSegments, total: totalSegments });
          }
        }
        continue;
      }
      throw error;
    }
  }

  return translations;
}

export async function translateMarkdown(source: string, options: TranslateMarkdownOptions): Promise<string> {
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkFrontmatter, ['yaml', 'toml'])
    .use(remarkStringify, {
      bullet: '-',
      fences: true,
      listItemIndent: 'one'
    });

  const tree = processor.parse(source);
  const segments = collectSegments(tree);

  if (segments.length === 0) {
    if (options.onProgress) {
      options.onProgress({ done: 1, total: 1 });
    }
    return source;
  }

  const glossaryEntries = buildGlossaryEntries(options.glossary);
  const segmentTerms = segments.map((segment) => termsInText(segment.text, glossaryEntries));

  const translations = await translateSegmentsWithRetries({
    segments,
    segmentTerms,
    config: options.config,
    prompt: options.prompt,
    judgePrompt: options.judgePrompt,
    onProgress: options.onProgress,
    logger: options.logger,
    chatCompletion: options.chatCompletion
  });

  segments.forEach((segment, index) => {
    segment.set(translations[index]);
  });

  const output = processor.stringify(tree);

  return output;
}
