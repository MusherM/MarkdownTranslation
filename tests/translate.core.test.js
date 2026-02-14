import assert from 'node:assert/strict';
import test from 'node:test';

import { translateMarkdown } from '../src/translate.js';

const BASE_CONFIG = {
  base_url: 'https://example.invalid/v1',
  api_key: 'test-key',
  model: 'test-model',
  retry_times: 2,
  temperature: 0,
  max_tokens: 512,
  timeout_ms: 1000,
  max_batch_chars: 4000,
  max_batch_tokens: 1200,
  max_batch_segments: 100,
  retry_base_delay_ms: 10,
  retry_max_delay_ms: 50
};

function extractInputPayload(userContent) {
  const marker = 'INPUT JSON:\n';
  const start = userContent.indexOf(marker);
  if (start === -1) {
    throw new Error('Missing INPUT JSON marker in user message');
  }
  const after = userContent.slice(start + marker.length);
  const endMarker = '\n\nReturn JSON only';
  const end = after.indexOf(endMarker);
  const jsonText = end === -1 ? after : after.slice(0, end);
  return JSON.parse(jsonText);
}

function createMockChatCompletion() {
  return async ({ messages }) => {
    const userMessage = messages.find((item) => item.role === 'user');
    assert.ok(userMessage, 'Expected one user message');

    const payload = extractInputPayload(userMessage.content);
    if (Array.isArray(payload.items)) {
      return JSON.stringify({
        decisions: payload.items.map((item) => ({
          id: item.id,
          accept: false,
          reason: 'mock reject'
        }))
      });
    }

    if (Array.isArray(payload.segments)) {
      return JSON.stringify({
        translations: payload.segments.map((segment) => ({
          id: segment.id,
          text: `中译:${segment.text}`
        }))
      });
    }

    throw new Error('Unexpected payload shape in mock chatCompletion');
  };
}

test('translateMarkdown keeps non-markdown code blocks unchanged by default', async () => {
  const source = [
    '# Title',
    '',
    'Hello world.',
    '',
    '```js',
    'const answer = 42;',
    '```'
  ].join('\n');

  const output = await translateMarkdown(source, {
    config: BASE_CONFIG,
    glossary: {},
    prompt: 'mock prompt',
    judgePrompt: 'mock judge',
    chatCompletion: createMockChatCompletion()
  });

  assert.match(output, /中译:Title/);
  assert.match(output, /中译:Hello world\./);
  assert.match(output, /const answer = 42;/);
  assert.doesNotMatch(output, /中译:const answer = 42;/);
});

test('translateMarkdown translates markdown snippets inside markdown code blocks when enabled', async () => {
  const source = [
    'Intro paragraph.',
    '',
    '```md',
    '## Inner Title',
    '',
    'Inner body.',
    '```',
    '',
    '```js',
    'const name = "Markdown";',
    '```'
  ].join('\n');

  const output = await translateMarkdown(source, {
    config: BASE_CONFIG,
    glossary: {},
    prompt: 'mock prompt',
    judgePrompt: 'mock judge',
    translateMarkdownCodeBlocks: true,
    chatCompletion: createMockChatCompletion()
  });

  assert.match(output, /中译:Intro paragraph\./);
  assert.match(output, /## 中译:Inner Title/);
  assert.match(output, /中译:Inner body\./);
  assert.match(output, /const name = "Markdown";/);
  assert.doesNotMatch(output, /中译:const name = "Markdown";/);
});
