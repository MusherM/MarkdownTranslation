import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkStringify from 'remark-stringify';
import remarkGfm from 'remark-gfm';
import remarkFrontmatter from 'remark-frontmatter';
import { visit, SKIP, EXIT } from 'unist-util-visit';
import { chatCompletion as defaultChatCompletion } from './openai.js';

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

function isMarkdownFenceLanguage(lang) {
  const normalized = (lang || '').trim().toLowerCase();
  return normalized === 'md' || normalized === 'markdown';
}

const markdownProbeProcessor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkFrontmatter, ['yaml', 'toml']);

const MARKDOWN_BLOCK_TYPES = new Set([
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

const MARKDOWN_INLINE_TYPES = new Set([
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

function isLikelyMarkdownCodeContent(value) {
  const normalized = value.replace(/\r\n/g, '\n').trim();
  if (!normalized) {
    return false;
  }

  let parsed;
  try {
    parsed = markdownProbeProcessor.parse(normalized);
  } catch {
    return false;
  }

  if (!Array.isArray(parsed.children) || parsed.children.length === 0) {
    return false;
  }

  let hasMarkdownSyntax = false;
  visit(parsed, (node, _index, parent) => {
    const type = node.type || '';
    if (MARKDOWN_BLOCK_TYPES.has(type)) {
      hasMarkdownSyntax = true;
      return EXIT;
    }
    if (parent && parent.type === 'paragraph' && MARKDOWN_INLINE_TYPES.has(type)) {
      hasMarkdownSyntax = true;
      return EXIT;
    }
    return undefined;
  });

  return hasMarkdownSyntax;
}

function shouldTranslateMarkdownCodeBlock(lang, value) {
  if (isMarkdownFenceLanguage(lang)) {
    return true;
  }
  if ((lang || '').trim().length > 0) {
    return false;
  }
  return isLikelyMarkdownCodeContent(value);
}

function collectMarkdownCodeBlockSegments(tree) {
  const segments = [];
  visit(tree, (node) => {
    if (node.type !== 'code') {
      return undefined;
    }

    const blockValue = node.value || '';
    if (!shouldTranslateMarkdownCodeBlock(node.lang, blockValue)) {
      return undefined;
    }

    segments.push({
      text: blockValue,
      set(value) {
        node.value = value;
      }
    });
    return undefined;
  });
  return segments;
}

function normalizeTrailingNewline(original, translated) {
  const originalHasTrailingNewline = /\r?\n$/.test(original);
  if (originalHasTrailingNewline) {
    return translated;
  }
  return translated.replace(/\r?\n$/, '');
}

function isAsciiWordCode(code) {
  return (
    (code >= 48 && code <= 57) || // 0-9
    (code >= 65 && code <= 90) || // A-Z
    (code >= 97 && code <= 122) || // a-z
    code === 95 // _
  );
}

function isCjkCodePoint(codePoint) {
  return (
    (codePoint >= 0x3400 && codePoint <= 0x4dbf) ||
    (codePoint >= 0x4e00 && codePoint <= 0x9fff) ||
    (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
    (codePoint >= 0x3040 && codePoint <= 0x30ff) ||
    (codePoint >= 0xac00 && codePoint <= 0xd7af)
  );
}

function estimateTokens(text) {
  if (!text) {
    return 0;
  }

  let tokens = 0;
  let asciiRun = 0;

  const flushAsciiRun = () => {
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

function estimateSegmentTokens(text) {
  return estimateTokens(text) + 12;
}

function buildBatches(indices, segments, { maxChars, maxTokens, maxSegments, baseTokens }) {
  const batches = [];
  let current = [];
  let charCount = 0;
  let tokenCount = baseTokens;

  for (const index of indices) {
    const text = segments[index].text;
    const length = text.length;
    const estimatedTokens = estimateSegmentTokens(text);
    const exceedsCount = current.length >= maxSegments;
    const exceedsChars = charCount + length > maxChars && current.length > 0;
    const exceedsTokens = tokenCount + estimatedTokens > maxTokens && current.length > 0;

    if (exceedsCount || exceedsChars || exceedsTokens) {
      batches.push(current);
      current = [];
      charCount = 0;
      tokenCount = baseTokens;
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
    const fencePattern = /```(?:json)?\s*([\s\S]*?)```/ig;
    let fenceMatch;
    while ((fenceMatch = fencePattern.exec(text)) !== null) {
      const candidate = fenceMatch[1].trim();
      if (!candidate) {
        continue;
      }
      try {
        return JSON.parse(candidate);
      } catch {
        // keep searching
      }
    }

    for (let start = text.indexOf('{'); start !== -1; start = text.indexOf('{', start + 1)) {
      let depth = 0;
      let inString = false;
      let escaped = false;

      for (let cursor = start; cursor < text.length; cursor += 1) {
        const ch = text[cursor];

        if (escaped) {
          escaped = false;
          continue;
        }
        if (ch === '\\') {
          escaped = true;
          continue;
        }
        if (ch === '"') {
          inString = !inString;
          continue;
        }

        if (inString) {
          continue;
        }

        if (ch === '{') {
          depth += 1;
          continue;
        }
        if (ch !== '}') {
          continue;
        }

        depth -= 1;
        if (depth !== 0) {
          continue;
        }

        const candidate = text.slice(start, cursor + 1);
        try {
          return JSON.parse(candidate);
        } catch {
          break;
        }
      }
    }

    throw new Error('Failed to parse JSON from model response');
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

function extractStatusCode(error) {
  if (!error || typeof error !== 'object') {
    return undefined;
  }
  if (Number.isInteger(error.statusCode)) {
    return error.statusCode;
  }
  const message = typeof error.message === 'string' ? error.message : '';
  const match = message.match(/\bAPI error (\d{3})\b/i);
  if (!match) {
    return undefined;
  }
  return Number(match[1]);
}

function extractRetryAfterMs(error) {
  if (!error || typeof error !== 'object') {
    return undefined;
  }
  if (Number.isFinite(error.retryAfterMs) && error.retryAfterMs >= 0) {
    return Math.floor(error.retryAfterMs);
  }
  return undefined;
}

function classifyRetryPolicy(error) {
  const statusCode = extractStatusCode(error);
  const message = error && typeof error.message === 'string' ? error.message : '';
  const lowered = message.toLowerCase();

  if (isCountMismatchError(error)) {
    return {
      retryable: true,
      category: 'response_shape',
      statusCode
    };
  }

  if (statusCode === 429) {
    return {
      retryable: true,
      category: 'rate_limit',
      statusCode
    };
  }

  if (statusCode === 408 || statusCode === 409 || statusCode === 425) {
    return {
      retryable: true,
      category: 'transient_http',
      statusCode
    };
  }

  if (typeof statusCode === 'number' && statusCode >= 500) {
    return {
      retryable: true,
      category: 'server_error',
      statusCode
    };
  }

  if (typeof statusCode === 'number' && statusCode >= 400 && statusCode < 500) {
    return {
      retryable: false,
      category: 'client_error',
      statusCode
    };
  }

  const timeoutLike = Boolean(
    error && (error.isTimeout === true || error.name === 'AbortError') ||
      lowered.includes('timeout') ||
      lowered.includes('timed out') ||
      lowered.includes('aborted')
  );
  if (timeoutLike) {
    return {
      retryable: true,
      category: 'timeout',
      statusCode
    };
  }

  const networkLike = /(network|fetch failed|socket hang up|econnreset|enotfound|eai_again|econnrefused|failed to fetch)/i.test(message);
  if (networkLike) {
    return {
      retryable: true,
      category: 'network',
      statusCode
    };
  }

  const parseLike = /(json|parse|response missing|incorrect number of translations)/i.test(message);
  if (parseLike) {
    return {
      retryable: true,
      category: 'response_shape',
      statusCode
    };
  }

  return {
    retryable: true,
    category: 'unknown',
    statusCode
  };
}

function computeRetryDelayMs({ attempt, config, retryPolicy, error }) {
  const baseDelay = Number.isFinite(config.retry_base_delay_ms) ? config.retry_base_delay_ms : 500;
  const maxDelay = Number.isFinite(config.retry_max_delay_ms) ? config.retry_max_delay_ms : 8000;
  const boundedBase = Math.max(0, Math.floor(baseDelay));
  const boundedMax = Math.max(boundedBase, Math.floor(maxDelay));
  const exponent = Math.max(0, attempt - 1);
  const jitter = (cap) => Math.floor(Math.random() * cap);

  if (retryPolicy.category === 'rate_limit') {
    const retryAfterMs = extractRetryAfterMs(error);
    if (typeof retryAfterMs === 'number') {
      return Math.min(boundedMax, Math.max(boundedBase, retryAfterMs));
    }
    const delay = boundedBase * 2 * (2 ** exponent) + jitter(Math.max(50, Math.floor(boundedBase * 0.5)));
    return Math.min(boundedMax, delay);
  }

  if (
    retryPolicy.category === 'server_error' ||
    retryPolicy.category === 'network' ||
    retryPolicy.category === 'timeout' ||
    retryPolicy.category === 'transient_http' ||
    retryPolicy.category === 'unknown'
  ) {
    const delay = boundedBase * (2 ** exponent) + jitter(Math.max(50, Math.floor(boundedBase * 0.3)));
    return Math.min(boundedMax, delay);
  }

  if (retryPolicy.category === 'response_shape') {
    const shapeDelay = 200 * (2 ** exponent) + jitter(80);
    return Math.min(boundedMax, Math.max(100, shapeDelay));
  }

  return boundedBase;
}

function wait(ms) {
  if (!ms || ms <= 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
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
  logger,
  chatCompletionFn
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

  const completionFn = chatCompletionFn || defaultChatCompletion;

  let content;
  try {
    content = await completionFn({
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
  logger,
  chatCompletionFn
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

  const completionFn = chatCompletionFn || defaultChatCompletion;

  let content;
  try {
    content = await completionFn({
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
  logger,
  chatCompletionFn
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
        logger,
        chatCompletionFn
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
            logger,
            chatCompletionFn
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

      const unresolved = new Set([...missingMap.keys()]);
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
          if (logger) {
            await logger.error('translation_non_retryable_error', {
              error: error.message || String(error),
              category: retryPolicy.category,
              status_code: retryPolicy.statusCode
            });
          }
          throw error;
        }

        console.warn('Non-retryable translation error encountered. Using last available translations.');
        if (logger) {
          await logger.warn('translation_non_retryable_after_success', {
            error: error.message || String(error),
            category: retryPolicy.category,
            status_code: retryPolicy.statusCode,
            pendingCount: pending.length
          });
        }
        pending = [];
        break;
      }

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

      const retryDelayMs = computeRetryDelayMs({
        attempt,
        config,
        retryPolicy,
        error
      });
      const statusPart = typeof retryPolicy.statusCode === 'number'
        ? ` (status ${retryPolicy.statusCode})`
        : '';
      console.warn(
        `Translation attempt failed${statusPart}. Retrying in ${retryDelayMs}ms. Error: ${error.message}`
      );
      if (logger) {
        await logger.warn('translation_attempt_failed', {
          error: error.message || String(error),
          category: retryPolicy.category,
          status_code: retryPolicy.statusCode,
          retry_delay_ms: retryDelayMs,
          attempt,
          max_attempts: config.retry_times
        });
      }
      await wait(retryDelayMs);
    }
  }

  if (pending.length > 0) {
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
  logger,
  chatCompletionFn
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
  const baseRequestTokens = estimateTokens(prompt) + 96;
  const maxBatchTokens = Number.isFinite(config.max_batch_tokens)
    ? config.max_batch_tokens
    : Math.max(512, Math.floor(config.max_tokens * 1.5));
  const batches = buildBatches(indices, segments, {
    maxChars: config.max_batch_chars,
    maxTokens: maxBatchTokens,
    maxSegments: config.max_batch_segments,
    baseTokens: baseRequestTokens
  });

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
        logger,
        chatCompletionFn
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
            logger,
            chatCompletionFn
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

async function translateMarkdownInternal(source, options, reportProgress) {
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
      chatCompletionFn: options.chatCompletion
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

export async function translateMarkdown(source, options) {
  return translateMarkdownInternal(source, options, true);
}
