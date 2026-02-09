import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkStringify from 'remark-stringify';
import remarkGfm from 'remark-gfm';
import remarkFrontmatter from 'remark-frontmatter';
import { visit, SKIP } from 'unist-util-visit';
import { chatCompletion } from './openai.js';

const SKIP_TYPES = new Set([
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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function createTermRegex(term) {
  if (/^[A-Za-z0-9]+$/.test(term)) {
    return new RegExp(`\\b${escapeRegExp(term)}\\b`, 'i');
  }
  return new RegExp(escapeRegExp(term), 'i');
}

function buildGlossaryEntries(glossary) {
  return Object.entries(glossary)
    .filter(([source, target]) => source && target)
    .map(([source, target]) => ({
      source,
      target,
      regex: createTermRegex(source)
    }));
}

function termsInText(text, entries) {
  const present = [];
  for (const entry of entries) {
    if (entry.regex.test(text)) {
      present.push(entry);
    }
  }
  return present;
}

function collectSegments(tree) {
  const segments = [];
  visit(tree, (node) => {
    if (SKIP_TYPES.has(node.type)) {
      return SKIP;
    }
    if (node.type === 'text') {
      segments.push({
        text: node.value || '',
        set(value) {
          node.value = value;
        }
      });
    }
  });
  return segments;
}

function buildBatches(indices, segments, maxChars, maxSegments) {
  const batches = [];
  let current = [];
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

function buildUserPayload({
  segments,
  glossaryEntries,
  missingEntries
}) {
  const payload = {
    source_language: 'English',
    target_language: 'Simplified Chinese',
    glossary: glossaryEntries.map((entry) => ({
      source: entry.source,
      target: entry.target
    })),
    segments
  };

  if (missingEntries && missingEntries.length > 0) {
    payload.missing_terms = missingEntries.map((entry) => ({
      source: entry.source,
      target: entry.target
    }));
  }

  return payload;
}

function buildUserMessage(payload) {
  return `INPUT JSON:\n${JSON.stringify(payload, null, 2)}\n\nReturn JSON only with the exact shape: {\"translations\": [{\"id\": <id>, \"text\": <translated>}, ...]}.\n- Include one item for every input segment id.\n- Every segment must be translated to Simplified Chinese.\n- Do not return the original English text unless the segment is only punctuation, symbols, or numbers.`;
}

function buildJudgeUserMessage(payload) {
  return `INPUT JSON:\n${JSON.stringify(payload, null, 2)}\n\nReturn JSON only with the exact shape: {\"decisions\": [{\"id\": <id>, \"accept\": <true|false>, \"reason\": <string>}, ...]}.`;
}

function normalizeSegmentItems(segments) {
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

function parseModelResponse(content) {
  let text = content.trim();
  if (text.startsWith('```')) {
    text = text.replace(/^```[a-z]*\n?/i, '').replace(/```$/, '').trim();
  }

  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) {
      throw new Error('Failed to parse JSON from model response');
    }
    const slice = text.slice(start, end + 1);
    return JSON.parse(slice);
  }
}

function coerceBoolean(value) {
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

function coerceTranslationText(item) {
  if (typeof item === 'string') {
    return item;
  }
  if (item && typeof item === 'object') {
    if (typeof item.text === 'string') {
      return item.text;
    }
    if (typeof item.translation === 'string') {
      return item.translation;
    }
    if (typeof item.value === 'string') {
      return item.value;
    }
  }
  return String(item ?? '');
}

function normalizeTranslations(parsed, segmentItems) {
  if (!parsed || !Array.isArray(parsed.translations)) {
    throw new Error('Model response missing translations array');
  }

  const raw = parsed.translations;
  const expectedIds = segmentItems.map((item) => item.id);
  const allStrings = raw.every((item) => typeof item === 'string');

  if (allStrings) {
    return {
      translations: raw.map((item) => String(item)),
      missingIds: []
    };
  }

  const byId = new Map();
  for (const item of raw) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const id = item.id ?? item.index ?? item.key;
    const text = item.text ?? item.translation ?? item.value;
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
    const missingIds = expectedIds.filter((id, idx) => translations[idx] === undefined);
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

function buildCountMismatchError({ expected, actual, missingIds }) {
  const error = new Error('Model returned incorrect number of translations');
  error.code = 'TRANSLATION_COUNT_MISMATCH';
  error.expected = expected;
  error.actual = actual;
  if (missingIds && missingIds.length > 0) {
    error.missingIds = missingIds;
  }
  return error;
}

function buildBatchFailedError({ attempts, pendingCount, cause }) {
  const reason = cause && cause.message ? cause.message : String(cause ?? 'unknown error');
  const error = new Error(
    `Translation failed for ${pendingCount} segments after ${attempts} attempts: ${reason}`
  );
  error.code = 'TRANSLATION_BATCH_FAILED';
  error.pendingCount = pendingCount;
  error.attempts = attempts;
  return error;
}

function isCountMismatchError(error) {
  if (!error) {
    return false;
  }
  if (error.code === 'TRANSLATION_COUNT_MISMATCH') {
    return true;
  }
  return Boolean(error.message && error.message.includes('incorrect number of translations'));
}

function isBatchFailedError(error) {
  if (!error) {
    return false;
  }
  return error.code === 'TRANSLATION_BATCH_FAILED';
}

function containsCjk(text) {
  return /[\u3400-\u9fff]/.test(text);
}

function englishWordCount(text) {
  const matches = text.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g);
  return matches ? matches.length : 0;
}

function normalizeComparableText(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isLikelyNaturalEnglishSegment(text) {
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

function isLikelyUntranslatedSegment(source, translation) {
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

function unionGlossaryEntries(segmentsTerms) {
  const map = new Map();
  for (const list of segmentsTerms) {
    for (const entry of list) {
      if (!map.has(entry.source)) {
        map.set(entry.source, entry);
      }
    }
  }
  return Array.from(map.values());
}

function checkGlossary(pendingIndices, segmentTerms, translations) {
  const missingMap = new Map();

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

function flattenMissingEntries(missingMap) {
  const map = new Map();
  for (const entries of missingMap.values()) {
    for (const entry of entries) {
      if (!map.has(entry.source)) {
        map.set(entry.source, entry);
      }
    }
  }
  return Array.from(map.values());
}

async function translateBatch({
  segments,
  glossaryEntries,
  missingEntries,
  config,
  prompt,
  logger
}) {
  const normalizedSegments = normalizeSegmentItems(segments);
  const payload = buildUserPayload({
    segments: normalizedSegments,
    glossaryEntries,
    missingEntries
  });

  const messages = [
    {
      role: 'system',
      content: prompt.trim()
    },
    {
      role: 'user',
      content: buildUserMessage(payload)
    }
  ];

  let content;
  try {
    content = await chatCompletion({
      baseUrl: config.base_url,
      apiKey: config.api_key,
      model: config.model,
      messages,
      temperature: config.temperature,
      max_tokens: config.max_tokens,
      timeoutMs: config.timeout_ms
    });
  } catch (error) {
    if (logger) {
      await logger.error('chat_completion_failed', {
        type: 'translation',
        error: error.message || String(error),
        request: { messages }
      });
    }
    throw error;
  }

  let parsed;
  try {
    parsed = parseModelResponse(content);
  } catch (error) {
    if (logger) {
      await logger.error('parse_translation_response_failed', {
        type: 'translation',
        error: error.message || String(error),
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
    if (logger) {
      await logger.error('translation_count_mismatch', {
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
    if (logger) {
      await logger.error('translation_count_mismatch', {
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
    if (logger) {
      await logger.error('translation_count_mismatch', {
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

async function judgeGlossaryTranslations({
  items,
  config,
  judgePrompt,
  logger
}) {
  if (!judgePrompt || items.length === 0) {
    return new Map();
  }

  const payload = {
    items
  };

  const messages = [
    {
      role: 'system',
      content: judgePrompt.trim()
    },
    {
      role: 'user',
      content: buildJudgeUserMessage(payload)
    }
  ];

  let content;
  try {
    content = await chatCompletion({
      baseUrl: config.base_url,
      apiKey: config.api_key,
      model: config.model,
      messages,
      temperature: config.temperature,
      max_tokens: config.max_tokens,
      timeoutMs: config.timeout_ms
    });
  } catch (error) {
    if (logger) {
      await logger.error('chat_completion_failed', {
        type: 'glossary_judge',
        error: error.message || String(error),
        request: { messages }
      });
    }
    throw new Error(`Glossary judge request failed: ${error.message}`);
  }

  let parsed;
  try {
    parsed = parseModelResponse(content);
  } catch (error) {
    if (logger) {
      await logger.error('parse_judge_response_failed', {
        type: 'glossary_judge',
        error: error.message || String(error),
        request: { messages },
        response: content
      });
    }
    throw new Error(`Glossary judge response parse failed: ${error.message}`);
  }
  if (!parsed || !Array.isArray(parsed.decisions)) {
    throw new Error('Judge response missing decisions array');
  }

  const decisions = new Map();
  for (const item of parsed.decisions) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const id = item.id ?? item.index ?? item.key;
    const numericId = Number(id);
    if (Number.isNaN(numericId)) {
      continue;
    }
    decisions.set(numericId, {
      accept: coerceBoolean(item.accept ?? item.approve ?? item.ok),
      reason: typeof item.reason === 'string' ? item.reason : ''
    });
  }

  return decisions;
}

async function translateBatchWithRetries({
  batchIndices,
  segments,
  segmentTerms,
  config,
  prompt,
  judgePrompt,
  translations,
  logger
}) {
  let pending = [...batchIndices];
  let attempt = 0;
  let missingEntries = [];
  let lastSuccessful = null;

  while (pending.length > 0 && attempt < config.retry_times) {
    attempt += 1;

    const batchSegments = pending.map((index) => ({
      id: index,
      text: segments[index].text
    }));
    const batchTerms = pending.map((index) => segmentTerms[index]);
    const batchGlossary = unionGlossaryEntries(batchTerms);

    try {
      const batchTranslations = await translateBatch({
        segments: batchSegments,
        glossaryEntries: batchGlossary,
        missingEntries,
        config,
        prompt,
        logger
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
        translations[index] = batchTranslations[pos];
      });

      const missingMap = checkGlossary(pending, segmentTerms, batchTranslations);
      const untranslatedIndices = pending.filter((index, pos) =>
        isLikelyUntranslatedSegment(segments[index].text, batchTranslations[pos])
      );

      if (untranslatedIndices.length > 0) {
        const sampleIds = untranslatedIndices.slice(0, 5).join(', ');
        const overflow = untranslatedIndices.length > 5 ? ` ... +${untranslatedIndices.length - 5}` : '';
        console.warn(`Detected untranslated English segments. Retrying. Segment ids: ${sampleIds}${overflow}`);
        if (logger) {
          await logger.warn('untranslated_segments_detected', {
            count: untranslatedIndices.length,
            segment_ids: untranslatedIndices
          });
        }
      }

      if (missingMap.size > 0) {
        const indexToTranslation = new Map();
        pending.forEach((index, pos) => {
          indexToTranslation.set(index, batchTranslations[pos]);
        });

        const judgeItems = Array.from(missingMap.entries()).map(([index, missing]) => ({
          id: index,
          source: segments[index].text,
          translation: indexToTranslation.get(index) ?? '',
          missing_terms: missing.map((entry) => ({
            source: entry.source,
            target: entry.target
          }))
        }));

        try {
          const decisions = await judgeGlossaryTranslations({
            items: judgeItems,
            config,
            judgePrompt,
            logger
          });
          if (decisions.size > 0) {
            for (const [index, decision] of decisions.entries()) {
              if (decision && decision.accept) {
                missingMap.delete(index);
              }
            }
          }
        } catch (error) {
          console.warn(`Glossary judge failed. Continuing with retries. Error: ${error.message}`);
          if (logger) {
            await logger.warn('glossary_judge_failed', {
              error: error.message || String(error),
              items: judgeItems
            });
          }
        }
      }

      const unresolved = new Set([...missingMap.keys(), ...untranslatedIndices]);
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
      if (attempt >= config.retry_times) {
        if (isCountMismatchError(error) && batchIndices.length > 1) {
          throw error;
        }
        if (!lastSuccessful) {
          const failedError = buildBatchFailedError({
            attempts: config.retry_times,
            pendingCount: pending.length,
            cause: error
          });
          if (logger) {
            await logger.error('translation_batch_failed', {
              error: failedError.message,
              pendingCount: pending.length,
              attempts: config.retry_times
            });
          }
          throw failedError;
        }
        console.warn('Translation retries exhausted. Using last available translations.');
        if (logger) {
          await logger.warn('translation_retries_exhausted', {
            error: error.message || String(error),
            pendingCount: pending.length
          });
        }
        pending = [];
        break;
      }
      console.warn(`Translation attempt failed. Retrying. Error: ${error.message}`);
      if (logger) {
        await logger.warn('translation_attempt_failed', {
          error: error.message || String(error)
        });
      }
    }
  }

  if (pending.length > 0) {
    const untranslatedAfterRetries = pending.filter((index) =>
      isLikelyUntranslatedSegment(segments[index].text, translations[index])
    );
    if (untranslatedAfterRetries.length > 0) {
      const unresolvedError = buildBatchFailedError({
        attempts: config.retry_times,
        pendingCount: untranslatedAfterRetries.length,
        cause: new Error('Some segments remained in English after all retries')
      });
      if (logger) {
        await logger.error('untranslated_segments_after_retries', {
          error: unresolvedError.message,
          segment_ids: untranslatedAfterRetries
        });
      }
      throw unresolvedError;
    }

    const missingList = missingEntries.map((entry) => `${entry.source} -> ${entry.target}`).join(', ');
    console.warn(`Glossary check failed after retries. Using last available translations. Missing terms: ${missingList}`);
    if (logger) {
      await logger.warn('glossary_check_failed_after_retries', {
        missing_terms: missingEntries.map((entry) => ({
          source: entry.source,
          target: entry.target
        }))
      });
    }
  }
}

async function translateSegmentsWithRetries({
  segments,
  segmentTerms,
  config,
  prompt,
  judgePrompt,
  onProgress,
  logger
}) {
  const translations = new Array(segments.length);
  const indices = segments
    .map((segment, index) => ({ segment, index }))
    .filter(({ segment }) => segment.text.trim().length > 0)
    .map(({ index }) => index);
  segments.forEach((segment, index) => {
    if (segment.text.trim().length === 0) {
      translations[index] = segment.text;
    }
  });
  const totalSegments = indices.length;
  let doneSegments = 0;
  if (onProgress) {
    if (totalSegments === 0) {
      onProgress({ done: 1, total: 1 });
    } else {
      onProgress({ done: 0, total: totalSegments });
    }
  }
  const batches = buildBatches(indices, segments, config.max_batch_chars, config.max_batch_segments);

  for (const batchIndices of batches) {
    try {
      await translateBatchWithRetries({
        batchIndices,
        segments,
        segmentTerms,
        config,
        prompt,
        judgePrompt,
        translations,
        logger
      });
      doneSegments += batchIndices.length;
      if (onProgress) {
        onProgress({ done: doneSegments, total: totalSegments });
      }
    } catch (error) {
      if ((isCountMismatchError(error) || isBatchFailedError(error)) && batchIndices.length > 1) {
        console.warn('Batch translation failed. Retrying with single-segment batches.');
        for (const index of batchIndices) {
          await translateBatchWithRetries({
            batchIndices: [index],
            segments,
            segmentTerms,
            config,
            prompt,
            judgePrompt,
            translations,
            logger
          });
          doneSegments += 1;
          if (onProgress) {
            onProgress({ done: doneSegments, total: totalSegments });
          }
        }
        continue;
      }
      throw error;
    }
  }

  return translations;
}

export async function translateMarkdown(source, { config, glossary, prompt, judgePrompt, onProgress, logger }) {
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
    if (onProgress) {
      onProgress({ done: 1, total: 1 });
    }
    return source;
  }

  const glossaryEntries = buildGlossaryEntries(glossary);
  const segmentTerms = segments.map((segment) => termsInText(segment.text, glossaryEntries));

  const translations = await translateSegmentsWithRetries({
    segments,
    segmentTerms,
    config,
    prompt,
    judgePrompt,
    onProgress,
    logger
  });

  segments.forEach((segment, index) => {
    segment.set(translations[index]);
  });

  const output = processor.stringify(tree);

  return output;
}
