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
  return `INPUT JSON:\n${JSON.stringify(payload, null, 2)}\n\nReturn JSON with the exact shape: {\"translations\": [ ... ] }`;
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
  const payload = buildUserPayload({
    segments,
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
  if (!parsed || !Array.isArray(parsed.translations)) {
    throw new Error('Model response missing translations array');
  }

  return parsed.translations.map((item) => (typeof item === 'string' ? item : String(item)));
}

async function translateSegmentsWithRetries({
  segments,
  segmentTerms,
  glossaryEntries,
  config,
  prompt
}) {
  const translations = new Array(segments.length);
  const indices = segments.map((_, index) => index);
  const batches = buildBatches(indices, segments, config.max_batch_chars, config.max_batch_segments);

  for (const batchIndices of batches) {
    let pending = [...batchIndices];
    let attempt = 0;
    let missingEntries = [];

    while (pending.length > 0 && attempt < config.retry_times) {
      attempt += 1;

      const batchSegments = pending.map((index) => segments[index].text);
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
          throw new Error('Model returned incorrect number of translations');
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
    glossaryEntries,
    config,
    prompt
  });

  segments.forEach((segment, index) => {
    segment.set(translations[index]);
  });

  const output = processor.stringify(tree);

  return output;
}
