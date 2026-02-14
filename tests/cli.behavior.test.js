import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI_PATH = path.join(REPO_ROOT, 'src', 'cli.js');

function runCli(args, extraEnv = {}) {
  return spawnSync(process.execPath, [CLI_PATH, ...args], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      ...extraEnv
    },
    encoding: 'utf8'
  });
}

function createTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test('directory mode ignores *.zh.md sources to prevent *.zh.zh.md outputs', () => {
  const root = createTempDir('md-translate-cli-scan-');
  const docsDir = path.join(root, 'docs');
  fs.mkdirSync(docsDir, { recursive: true });

  fs.writeFileSync(path.join(docsDir, 'guide.md'), 'Guide content.\n', 'utf8');
  fs.writeFileSync(path.join(docsDir, 'guide.zh.md'), '已有译文。\n', 'utf8');
  fs.writeFileSync(path.join(docsDir, 'already.zh.md'), '已翻译文件。\n', 'utf8');

  const result = runCli([docsDir], { OPENAI_API_KEY: 'dummy-key' });

  assert.equal(result.status, 0, `CLI failed.\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  assert.match(result.stdout, /Translated 1 markdown files\./);
  assert.ok(
    !fs.existsSync(path.join(docsDir, 'already.zh.zh.md')),
    'should not create double-suffixed output for translated source files'
  );
});

test('config-relative prompt/judge/glossary/log paths resolve from config directory', () => {
  const root = createTempDir('md-translate-cli-config-paths-');
  const docsDir = path.join(root, 'docs');
  const configDir = path.join(root, 'config');
  const promptsDir = path.join(configDir, 'prompts');
  const logsDir = path.join(configDir, 'logs');

  fs.mkdirSync(docsDir, { recursive: true });
  fs.mkdirSync(promptsDir, { recursive: true });

  fs.writeFileSync(path.join(docsDir, 'sample.md'), 'Sample text.\n', 'utf8');
  fs.writeFileSync(path.join(docsDir, 'sample.zh.md'), '示例译文。\n', 'utf8');
  fs.writeFileSync(path.join(promptsDir, 'translate.md'), 'mock translate prompt', 'utf8');
  fs.writeFileSync(path.join(promptsDir, 'judge.md'), 'mock judge prompt', 'utf8');
  fs.writeFileSync(path.join(configDir, 'glossary.jsonc'), '{ "Sample": "示例" }', 'utf8');

  const configPath = path.join(configDir, 'config.jsonc');
  const configContent = {
    base_url: 'https://example.invalid/v1',
    api_key: 'dummy-key',
    model: 'mock-model',
    retry_times: 1,
    temperature: 0,
    max_tokens: 256,
    timeout_ms: 1000,
    max_batch_tokens: 256,
    max_batch_segments: 20,
    prompt_path: './prompts/translate.md',
    judge_prompt_path: './prompts/judge.md',
    glossary_path: './glossary.jsonc',
    log_path: './logs/translate.log'
  };
  fs.writeFileSync(configPath, JSON.stringify(configContent, null, 2), 'utf8');

  const result = runCli([docsDir, '-c', configPath]);

  assert.equal(result.status, 0, `CLI failed.\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  assert.match(result.stdout, /Using config:/);
  assert.ok(
    fs.existsSync(path.join(logsDir, 'translate.log')),
    'log file should be created under config directory'
  );
});
