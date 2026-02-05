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
  return `INPUT JSON:\n${JSON.stringify(payload, null, 2)}\n\nReturn JSON only with the exact shape: {\"translations\": [{\"id\": <id>, \"text\": <translated>}, ...]}.\n- Include one item for every input segment id.\n- If you cannot translate a segment, return the original text as the value of \"text\".`;
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

function isCountMismatchError(error) {
  if (!error) {
    return false;
  }
  if (error.code === 'TRANSLATION_COUNT_MISMATCH') {
    return true;
  }
  return Boolean(error.message && error.message.includes('incorrect number of translations'));
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
  prompt
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

  const content = await chatCompletion({
    baseUrl: config.base_url,
    apiKey: config.api_key,
    model: config.model,
    messages,
    temperature: config.temperature,
    max_tokens: config.max_tokens
  });

  const parsed = parseModelResponse(content);
  const normalized = normalizeTranslations(parsed, normalizedSegments);
  const translations = normalized.translations.map((item) =>
    typeof item === 'string' ? item : String(item ?? '')
  );

  if (normalized.missingIds && normalized.missingIds.length > 0) {
    throw buildCountMismatchError({
      expected: normalizedSegments.length,
      actual: translations.filter((item) => item !== undefined).length,
      missingIds: normalized.missingIds
    });
  }

  if (translations.length !== normalizedSegments.length) {
    throw buildCountMismatchError({
      expected: normalizedSegments.length,
      actual: translations.length
    });
  }

  if (translations.some((item) => item === undefined)) {
    throw buildCountMismatchError({
      expected: normalizedSegments.length,
      actual: translations.filter((item) => item !== undefined).length
    });
  }

  return translations;
}

async function translateBatchWithRetries({
  batchIndices,
  segments,
  segmentTerms,
  config,
  prompt,
  translations
}) {
  let pending = [...batchIndices];
  let attempt = 0;
  let missingEntries = [];

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
        prompt
      });

      if (batchTranslations.length !== batchSegments.length) {
        throw buildCountMismatchError({
          expected: batchSegments.length,
          actual: batchTranslations.length
        });
      }

      pending.forEach((index, pos) => {
        translations[index] = batchTranslations[pos];
      });

      const missingMap = checkGlossary(pending, segmentTerms, batchTranslations);
      if (missingMap.size === 0) {
        pending = [];
        break;
      }

      missingEntries = flattenMissingEntries(missingMap);
      pending = Array.from(missingMap.keys());

      const missingList = missingEntries.map((entry) => `${entry.source} -> ${entry.target}`).join(', ');
      console.warn(`Glossary check failed. Retrying. Missing terms: ${missingList}`);
    } catch (error) {
      if (attempt >= config.retry_times) {
        throw error;
      }
      console.warn(`Translation attempt failed. Retrying. Error: ${error.message}`);
    }
  }

  if (pending.length > 0) {
    const missingList = missingEntries.map((entry) => `${entry.source} -> ${entry.target}`).join(', ');
    throw new Error(`Glossary check failed after retries. Missing terms: ${missingList}`);
  }
}

async function translateSegmentsWithRetries({
  segments,
  segmentTerms,
  config,
  prompt
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
  const batches = buildBatches(indices, segments, config.max_batch_chars, config.max_batch_segments);

  for (const batchIndices of batches) {
    try {
      await translateBatchWithRetries({
        batchIndices,
        segments,
        segmentTerms,
        config,
        prompt,
        translations
      });
    } catch (error) {
      if (isCountMismatchError(error) && batchIndices.length > 1) {
        console.warn('Model returned incorrect number of translations. Retrying with single-segment batches.');
        for (const index of batchIndices) {
          await translateBatchWithRetries({
            batchIndices: [index],
            segments,
            segmentTerms,
            config,
            prompt,
            translations
          });
        }
        continue;
      }
      throw error;
    }
  }

  return translations;
}

export async function translateMarkdown(source, { config, glossary, prompt }) {
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
    return source;
  }

  const glossaryEntries = buildGlossaryEntries(glossary);
  const segmentTerms = segments.map((segment) => termsInText(segment.text, glossaryEntries));

  const translations = await translateSegmentsWithRetries({
    segments,
    segmentTerms,
    config,
    prompt
  });

  segments.forEach((segment, index) => {
    segment.set(translations[index]);
  });

  const output = processor.stringify(tree);

  return output;
}
