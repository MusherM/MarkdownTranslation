import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse } from 'jsonc-parser';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI_PATH = path.join(REPO_ROOT, 'src', 'cli.js');
const PROJECT_CONFIG_PATH = path.join(REPO_ROOT, 'config.jsonc');

const shouldRunLiveTest = process.env.RUN_LIVE_TRANSLATION_TEST === '1';

function readProjectConfig() {
  const raw = fs.readFileSync(PROJECT_CONFIG_PATH, 'utf8');
  const parsed = parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {};
  }
  return parsed;
}

test(
  'live CLI translation (requires OPENAI_API_KEY)',
  { skip: shouldRunLiveTest ? false : 'set RUN_LIVE_TRANSLATION_TEST=1 to enable live API test' },
  () => {
    assert.ok(
      process.env.OPENAI_API_KEY,
      'OPENAI_API_KEY is required for live translation test'
    );

    const projectConfig = readProjectConfig();
    const baseUrl = process.env.OPENAI_BASE_URL || projectConfig.base_url || 'https://api.openai.com/v1';
    const model = process.env.OPENAI_MODEL || projectConfig.model || 'gpt-4o-mini';

    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'md-translate-live-'));
    const promptsDir = path.join(tempRoot, 'prompts');
    fs.mkdirSync(promptsDir, { recursive: true });

    const promptPath = path.join(promptsDir, 'translate.md');
    const judgePromptPath = path.join(promptsDir, 'judge.md');
    const inputPath = path.join(tempRoot, 'live.md');
    const configPath = path.join(tempRoot, 'config.jsonc');

    fs.writeFileSync(
      promptPath,
      [
        'You are a JSON translation engine.',
        'Return only JSON object with exact shape:',
        '{"translations":[{"id":<id>,"text":"<Simplified Chinese translation>"}]}',
        'Rules:',
        '- Translate every segment text to Simplified Chinese.',
        '- Keep the same id values.',
        '- Do not add extra keys.',
        '- Do not output markdown, comments, or explanations.'
      ].join('\n'),
      'utf8'
    );
    fs.writeFileSync(
      judgePromptPath,
      'Return only JSON: {"decisions":[{"id":<id>,"accept":false,"reason":"strict"}]}',
      'utf8'
    );
    fs.writeFileSync(
      inputPath,
      '# Live Test\n\nTranslate this sentence into Simplified Chinese.\n',
      'utf8'
    );
    fs.writeFileSync(
      configPath,
      JSON.stringify(
        {
          base_url: baseUrl,
          api_key: '',
          model,
          retry_times: 3,
          temperature: 0.2,
          max_tokens: 2048,
          timeout_ms: 120000,
          max_batch_tokens: 512,
          max_batch_segments: 20,
          retry_base_delay_ms: 200,
          retry_max_delay_ms: 1000,
          prompt_path: './prompts/translate.md',
          judge_prompt_path: './prompts/judge.md'
        },
        null,
        2
      ),
      'utf8'
    );

    const result = spawnSync(
      process.execPath,
      [CLI_PATH, inputPath, '-o', '-', '-c', configPath],
      {
        cwd: REPO_ROOT,
        env: process.env,
        encoding: 'utf8'
      }
    );

    assert.equal(
      result.status,
      0,
      `Live CLI translation failed.\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
    );

    const stdout = result.stdout.trim();
    assert.ok(stdout.length > 0, 'Expected non-empty translated output');
    assert.match(stdout, /[\u3400-\u9FFF]/, 'Expected translated output to include CJK characters');
  }
);
