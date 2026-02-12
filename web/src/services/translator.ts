import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkStringify from 'remark-stringify';
import remarkGfm from 'remark-gfm';
import remarkFrontmatter from 'remark-frontmatter';
import { visit, SKIP, EXIT } from 'unist-util-visit';
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
  max_batch_chars?: number;
  max_batch_tokens?: number;
  max_batch_segments: number;
  retry_base_delay_ms?: number;
  retry_max_delay_ms?: number;
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
  translateMarkdownCodeBlocks?: boolean;
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

type RuntimeTranslatorConfig = TranslatorConfig & {
  timeout_ms: number;
  max_batch_chars: number;
  max_batch_tokens: number;
  retry_base_delay_ms: number;
  retry_max_delay_ms: number;
};

type RetryPolicy = {
  retryable: boolean;
  category:
    | 'rate_limit'
    | 'transient_http'
    | 'server_error'
    | 'client_error'
    | 'timeout'
    | 'network'
    | 'response_shape'
    | 'unknown';
  statusCode?: number;
};

const DEFAULT_TIMEOUT_MS = 120000;
const DEFAULT_MAX_BATCH_TOKENS = 3000;
const DEFAULT_BATCH_CHARS_PER_TOKEN = 8;
const DEFAULT_MIN_BATCH_CHARS = 4000;
const DEFAULT_RETRY_BASE_DELAY_MS = 500;
const DEFAULT_RETRY_MAX_DELAY_MS = 8000;

function ensureNonEmptyString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Invalid config "${fieldName}": expected a non-empty string`);
  }
  return value;
}

function ensureInteger(
  value: unknown,
  fieldName: string,
  bounds: { min?: number; max?: number } = {}
): number {
  const min = bounds.min ?? Number.NEGATIVE_INFINITY;
  const max = bounds.max ?? Number.POSITIVE_INFINITY;
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric < min || numeric > max) {
    throw new Error(
      `Invalid config "${fieldName}": expected integer in [${min}, ${max}], got ${String(value)}`
    );
  }
  return numeric;
}

function ensureNumber(
  value: unknown,
  fieldName: string,
  bounds: { min?: number; max?: number } = {}
): number {
  const min = bounds.min ?? Number.NEGATIVE_INFINITY;
  const max = bounds.max ?? Number.POSITIVE_INFINITY;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < min || numeric > max) {
    throw new Error(
      `Invalid config "${fieldName}": expected number in [${min}, ${max}], got ${String(value)}`
    );
  }
  return numeric;
}

function hasConfigValue(value: unknown): boolean {
  if (value === undefined || value === null) {
    return false;
  }
  if (typeof value === 'string' && value.trim().length === 0) {
    return false;
  }
  return true;
}

function deriveMaxBatchChars(maxBatchTokens: number): number {
  return Math.max(
    DEFAULT_MIN_BATCH_CHARS,
    Math.ceil(maxBatchTokens * DEFAULT_BATCH_CHARS_PER_TOKEN)
  );
}

function normalizeTranslatorConfig(config: TranslatorConfig): RuntimeTranslatorConfig {
  const initialMaxBatchTokens = config.max_batch_tokens ?? DEFAULT_MAX_BATCH_TOKENS;
  const normalized: RuntimeTranslatorConfig = {
    ...config,
    timeout_ms: config.timeout_ms ?? DEFAULT_TIMEOUT_MS,
    max_batch_chars: hasConfigValue(config.max_batch_chars)
      ? Number(config.max_batch_chars)
      : deriveMaxBatchChars(Number(initialMaxBatchTokens)),
    max_batch_tokens: initialMaxBatchTokens,
    retry_base_delay_ms: config.retry_base_delay_ms ?? DEFAULT_RETRY_BASE_DELAY_MS,
    retry_max_delay_ms: config.retry_max_delay_ms ?? DEFAULT_RETRY_MAX_DELAY_MS
  };

  normalized.base_url = ensureNonEmptyString(normalized.base_url, 'base_url');
  normalized.model = ensureNonEmptyString(normalized.model, 'model');

  normalized.retry_times = ensureInteger(normalized.retry_times, 'retry_times', { min: 1, max: 20 });
  normalized.temperature = ensureNumber(normalized.temperature, 'temperature', { min: 0, max: 2 });
  normalized.max_tokens = ensureInteger(normalized.max_tokens, 'max_tokens', { min: 1 });
  normalized.timeout_ms = ensureInteger(normalized.timeout_ms, 'timeout_ms', { min: 1000 });
  normalized.max_batch_tokens = ensureInteger(normalized.max_batch_tokens, 'max_batch_tokens', { min: 128 });
  normalized.max_batch_chars = ensureInteger(normalized.max_batch_chars, 'max_batch_chars', { min: 1 });
  normalized.max_batch_segments = ensureInteger(normalized.max_batch_segments, 'max_batch_segments', { min: 1 });
  normalized.retry_base_delay_ms = ensureInteger(
    normalized.retry_base_delay_ms,
    'retry_base_delay_ms',
    { min: 0, max: 60000 }
  );
  normalized.retry_max_delay_ms = ensureInteger(
    normalized.retry_max_delay_ms,
    'retry_max_delay_ms',
    { min: 100, max: 120000 }
  );

  if (normalized.retry_max_delay_ms < normalized.retry_base_delay_ms) {
    throw new Error(
      'Invalid config "retry_max_delay_ms": must be greater than or equal to retry_base_delay_ms'
    );
  }

  return normalized;
}

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

function isMarkdownFenceLanguage(lang?: string | null): boolean {
  const normalized = (lang ?? '').trim().toLowerCase();
  return normalized === 'md' || normalized === 'markdown';
}

const markdownProbeProcessor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkFrontmatter, ['yaml', 'toml']);

const MARKDOWN_BLOCK_TYPES = new Set<string>([
  'heading',
  'list',
  'blockquote',
  'thematicBreak',
  'table',
  'code',
  'html',
  'yaml',
  'toml',
  'definition',
  'footnoteDefinition'
]);

const MARKDOWN_INLINE_TYPES = new Set<string>([
  'link',
  'image',
  'strong',
  'emphasis',
  'delete',
  'inlineCode',
  'footnoteReference',
  'linkReference',
  'imageReference',
  'break'
]);

function isLikelyMarkdownCodeContent(value: string): boolean {
  const normalized = value.replace(/\r\n/g, '\n').trim();
  if (!normalized) {
    return false;
  }

  let parsed: Node;
  try {
    parsed = markdownProbeProcessor.parse(normalized);
  } catch {
    return false;
  }

  const root = parsed as { children?: Array<{ type?: string }> };
  if (!Array.isArray(root.children) || root.children.length === 0) {
    return false;
  }

  let hasMarkdownSyntax = false;
  visit(parsed, (node, _index, parent) => {
    const typedNode = node as { type?: string };
    const parentNode = parent as { type?: string } | undefined;
    const type = typedNode.type ?? '';

    if (MARKDOWN_BLOCK_TYPES.has(type)) {
      hasMarkdownSyntax = true;
      return EXIT;
    }
    if (parentNode?.type === 'paragraph' && MARKDOWN_INLINE_TYPES.has(type)) {
      hasMarkdownSyntax = true;
      return EXIT;
    }
    return undefined;
  });

  return hasMarkdownSyntax;
}

function shouldTranslateMarkdownCodeBlock(lang: string | null | undefined, value: string): boolean {
  if (isMarkdownFenceLanguage(lang)) {
    return true;
  }

  // If language is explicitly specified and not markdown, trust it.
  if ((lang ?? '').trim().length > 0) {
    return false;
  }

  return isLikelyMarkdownCodeContent(value);
}

function collectMarkdownCodeBlockSegments(tree: Node): Segment[] {
  const segments: Segment[] = [];
  visit(tree, (node) => {
    const typedNode = node as { type: string; lang?: string | null; value?: string };
    if (typedNode.type !== 'code') {
      return undefined;
    }

    const blockValue = typedNode.value ?? '';
    if (!shouldTranslateMarkdownCodeBlock(typedNode.lang, blockValue)) {
      return undefined;
    }

    segments.push({
      text: blockValue,
      set(value) {
        typedNode.value = value;
      }
    });
    return undefined;
  });
  return segments;
}

function normalizeTrailingNewline(original: string, translated: string): string {
  const originalHasTrailingNewline = /\r?\n$/.test(original);
  if (originalHasTrailingNewline) {
    return translated;
  }
  return translated.replace(/\r?\n$/, '');
}

function isAsciiWordCode(code: number): boolean {
  return (
    (code >= 48 && code <= 57) || // 0-9
    (code >= 65 && code <= 90) || // A-Z
    (code >= 97 && code <= 122) || // a-z
    code === 95 // _
  );
}

function isCjkCodePoint(codePoint: number): boolean {
  return (
    (codePoint >= 0x3400 && codePoint <= 0x4dbf) ||
    (codePoint >= 0x4e00 && codePoint <= 0x9fff) ||
    (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
    (codePoint >= 0x3040 && codePoint <= 0x30ff) ||
    (codePoint >= 0xac00 && codePoint <= 0xd7af)
  );
}

function estimateTokens(text: string): number {
  if (!text) {
    return 0;
  }

  let tokens = 0;
  let asciiRun = 0;

  const flushAsciiRun = (): void => {
    if (asciiRun > 0) {
      tokens += Math.ceil(asciiRun / 4);
      asciiRun = 0;
    }
  };

  for (const char of text) {
    const codePoint = char.codePointAt(0);
    if (typeof codePoint !== 'number') {
      continue;
    }

    if (codePoint <= 0x7f && isAsciiWordCode(codePoint)) {
      asciiRun += 1;
      continue;
    }

    flushAsciiRun();

    if (char === ' ' || char === '\n' || char === '\r' || char === '\t') {
      continue;
    }

    if (isCjkCodePoint(codePoint)) {
      tokens += 1;
      continue;
    }

    tokens += 1;
  }

  flushAsciiRun();

  return Math.max(1, Math.ceil(tokens * 1.1));
}

function estimateSegmentTokens(text: string): number {
  return estimateTokens(text) + 12;
}

function buildBatches(
  indices: number[],
  segments: Segment[],
  limits: {
    maxChars: number;
    maxTokens: number;
    maxSegments: number;
    baseTokens: number;
  }
): number[][] {
  const batches: number[][] = [];
  let current: number[] = [];
  let charCount = 0;
  let tokenCount = limits.baseTokens;

  for (const index of indices) {
    const text = segments[index].text;
    const length = text.length;
    const estimatedTokens = estimateSegmentTokens(text);
    const exceedsCount = current.length >= limits.maxSegments;
    const exceedsChars = charCount + length > limits.maxChars && current.length > 0;
    const exceedsTokens = tokenCount + estimatedTokens > limits.maxTokens && current.length > 0;

    if (exceedsCount || exceedsChars || exceedsTokens) {
      batches.push(current);
      current = [];
      charCount = 0;
      tokenCount = limits.baseTokens;
    }

    current.push(index);
    charCount += length;
    tokenCount += estimatedTokens;
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
  const payload: {
    source_language: string;
    target_language: string;
    glossary: Array<{ source: string; target: string }>;
    segments: NormalizedSegmentItem[];
    missing_terms?: Array<{ source: string; target: string }>;
  } = {
    source_language: 'English',
    target_language: 'Simplified Chinese',
    glossary: params.glossaryEntries.map((entry) => ({
      source: entry.source,
      target: entry.target
    })),
    segments: params.segments
  };

  if (params.missingEntries && params.missingEntries.length > 0) {
    payload.missing_terms = params.missingEntries.map((entry) => ({
      source: entry.source,
      target: entry.target
    }));
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

function extractStatusCode(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') {
    return undefined;
  }
  const statusCode = (error as { statusCode?: unknown }).statusCode;
  if (Number.isInteger(statusCode)) {
    return Number(statusCode);
  }
  const message = (error as { message?: unknown }).message;
  if (typeof message !== 'string') {
    return undefined;
  }
  const match = message.match(/\bAPI error (\d{3})\b/i);
  if (!match) {
    return undefined;
  }
  return Number(match[1]);
}

function extractRetryAfterMs(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') {
    return undefined;
  }
  const retryAfterMs = (error as { retryAfterMs?: unknown }).retryAfterMs;
  if (Number.isFinite(retryAfterMs) && Number(retryAfterMs) >= 0) {
    return Math.floor(Number(retryAfterMs));
  }
  return undefined;
}

function classifyRetryPolicy(error: unknown): RetryPolicy {
  const statusCode = extractStatusCode(error);
  const message = error && typeof error === 'object' && typeof (error as { message?: unknown }).message === 'string'
    ? (error as { message: string }).message
    : '';
  const lowered = message.toLowerCase();

  if (isCountMismatchError(error)) {
    return { retryable: true, category: 'response_shape', statusCode };
  }

  if (statusCode === 429) {
    return { retryable: true, category: 'rate_limit', statusCode };
  }

  if (statusCode === 408 || statusCode === 409 || statusCode === 425) {
    return { retryable: true, category: 'transient_http', statusCode };
  }

  if (typeof statusCode === 'number' && statusCode >= 500) {
    return { retryable: true, category: 'server_error', statusCode };
  }

  if (typeof statusCode === 'number' && statusCode >= 400 && statusCode < 500) {
    return { retryable: false, category: 'client_error', statusCode };
  }

  const timeoutFlag = error && typeof error === 'object'
    ? Boolean(
      (error as { isTimeout?: unknown; name?: unknown }).isTimeout === true ||
      (error as { name?: unknown }).name === 'AbortError'
    )
    : false;
  const timeoutLike = timeoutFlag || lowered.includes('timeout') || lowered.includes('timed out') || lowered.includes('aborted');
  if (timeoutLike) {
    return { retryable: true, category: 'timeout', statusCode };
  }

  const networkLike = /(network|fetch failed|socket hang up|econnreset|enotfound|eai_again|econnrefused|failed to fetch)/i.test(message);
  if (networkLike) {
    return { retryable: true, category: 'network', statusCode };
  }

  const parseLike = /(json|parse|response missing|incorrect number of translations)/i.test(message);
  if (parseLike) {
    return { retryable: true, category: 'response_shape', statusCode };
  }

  return { retryable: true, category: 'unknown', statusCode };
}

function computeRetryDelayMs(params: {
  attempt: number;
  config: RuntimeTranslatorConfig;
  retryPolicy: RetryPolicy;
  error: unknown;
}): number {
  const boundedBase = Math.max(0, Math.floor(params.config.retry_base_delay_ms));
  const boundedMax = Math.max(boundedBase, Math.floor(params.config.retry_max_delay_ms));
  const exponent = Math.max(0, params.attempt - 1);
  const jitter = (cap: number): number => Math.floor(Math.random() * cap);

  if (params.retryPolicy.category === 'rate_limit') {
    const retryAfterMs = extractRetryAfterMs(params.error);
    if (typeof retryAfterMs === 'number') {
      return Math.min(boundedMax, Math.max(boundedBase, retryAfterMs));
    }
    const delay = boundedBase * 2 * (2 ** exponent) + jitter(Math.max(50, Math.floor(boundedBase * 0.5)));
    return Math.min(boundedMax, delay);
  }

  if (
    params.retryPolicy.category === 'server_error' ||
    params.retryPolicy.category === 'network' ||
    params.retryPolicy.category === 'timeout' ||
    params.retryPolicy.category === 'transient_http' ||
    params.retryPolicy.category === 'unknown'
  ) {
    const delay = boundedBase * (2 ** exponent) + jitter(Math.max(50, Math.floor(boundedBase * 0.3)));
    return Math.min(boundedMax, delay);
  }

  if (params.retryPolicy.category === 'response_shape') {
    const shapeDelay = 200 * (2 ** exponent) + jitter(80);
    return Math.min(boundedMax, Math.max(100, shapeDelay));
  }

  return boundedBase;
}

async function wait(ms: number): Promise<void> {
  if (!ms || ms <= 0) {
    return;
  }
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
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
  config: RuntimeTranslatorConfig;
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
  config: RuntimeTranslatorConfig;
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
  config: RuntimeTranslatorConfig;
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

      const unresolved = new Set<number>([...missingMap.keys()]);
      if (unresolved.size === 0) {
        pending = [];
        break;
      }

      missingEntries = flattenMissingEntries(missingMap);
      pending = Array.from(unresolved);

      if (missingEntries.length > 0) {
        const missingList = missingEntries.map((entry) => `${entry.source} -> ${entry.target}`).join(', ');
        console.warn(`Glossary check failed. Retrying. Missing terms: ${missingList}`);
      }
    } catch (error) {
      const retryPolicy = classifyRetryPolicy(error);

      if (!retryPolicy.retryable) {
        if (!lastSuccessful) {
          if (params.logger?.error) {
            await params.logger.error('translation_non_retryable_error', {
              error: (error as Error).message || String(error),
              category: retryPolicy.category,
              status_code: retryPolicy.statusCode
            });
          }
          throw error;
        }

        console.warn('Non-retryable translation error encountered. Using last available translations.');
        if (params.logger?.warn) {
          await params.logger.warn('translation_non_retryable_after_success', {
            error: (error as Error).message || String(error),
            category: retryPolicy.category,
            status_code: retryPolicy.statusCode,
            pendingCount: pending.length
          });
        }
        pending = [];
        break;
      }

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

      const retryDelayMs = computeRetryDelayMs({
        attempt,
        config: params.config,
        retryPolicy,
        error
      });
      const statusPart = typeof retryPolicy.statusCode === 'number'
        ? ` (status ${retryPolicy.statusCode})`
        : '';
      console.warn(
        `Translation attempt failed${statusPart}. Retrying in ${retryDelayMs}ms. Error: ${(error as Error).message}`
      );
      if (params.logger?.warn) {
        await params.logger.warn('translation_attempt_failed', {
          error: (error as Error).message || String(error),
          category: retryPolicy.category,
          status_code: retryPolicy.statusCode,
          retry_delay_ms: retryDelayMs,
          attempt,
          max_attempts: params.config.retry_times
        });
      }
      await wait(retryDelayMs);
    }
  }

  if (pending.length > 0) {
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
  config: RuntimeTranslatorConfig;
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
  const baseRequestTokens = estimateTokens(params.prompt) + 96;
  const batches = buildBatches(indices, params.segments, {
    maxChars: params.config.max_batch_chars,
    maxTokens: params.config.max_batch_tokens,
    maxSegments: params.config.max_batch_segments,
    baseTokens: baseRequestTokens
  });

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

async function translateMarkdownInternal(
  source: string,
  options: TranslateMarkdownOptions & { config: RuntimeTranslatorConfig },
  reportProgress: boolean
): Promise<string> {
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
  const markdownCodeSegments = options.translateMarkdownCodeBlocks
    ? collectMarkdownCodeBlockSegments(tree)
    : [];

  if (segments.length === 0 && markdownCodeSegments.length === 0) {
    if (reportProgress && options.onProgress) {
      options.onProgress({ done: 1, total: 1 });
    }
    return source;
  }

  if (segments.length > 0) {
    const glossaryEntries = buildGlossaryEntries(options.glossary);
    const segmentTerms = segments.map((segment) => termsInText(segment.text, glossaryEntries));

    const translations = await translateSegmentsWithRetries({
      segments,
      segmentTerms,
      config: options.config,
      prompt: options.prompt,
      judgePrompt: options.judgePrompt,
      onProgress: reportProgress ? options.onProgress : undefined,
      logger: options.logger,
      chatCompletion: options.chatCompletion
    });

    segments.forEach((segment, index) => {
      segment.set(translations[index]);
    });
  } else if (reportProgress && options.onProgress && markdownCodeSegments.length > 0) {
    options.onProgress({ done: 0, total: 1 });
  }

  if (markdownCodeSegments.length > 0) {
    for (const segment of markdownCodeSegments) {
      const translated = await translateMarkdownInternal(segment.text, options, false);
      segment.set(normalizeTrailingNewline(segment.text, translated));
    }
    if (reportProgress && options.onProgress && segments.length === 0) {
      options.onProgress({ done: 1, total: 1 });
    }
  }

  const output = processor.stringify(tree);

  return output;
}

export async function translateMarkdown(source: string, options: TranslateMarkdownOptions): Promise<string> {
  const normalizedOptions: TranslateMarkdownOptions & { config: RuntimeTranslatorConfig } = {
    ...options,
    config: normalizeTranslatorConfig(options.config)
  };
  return translateMarkdownInternal(source, normalizedOptions, true);
}
