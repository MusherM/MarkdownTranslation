#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadConfig } from './config.js';
import { loadGlossary } from './glossary.js';
import { loadPrompt } from './prompt.js';
import { createProgressBar } from './progress.js';
import { translateMarkdown } from './translate.js';

function printUsage() {
  console.log(`Usage: md-translate <input.md|dir> [options]

Options:
  -c, --config <path>   Path to config.jsonc or config.json
  -o, --output <path>   Output markdown path or directory
  -h, --help            Show this help
`);
}

function resolveDefaultPromptPath() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, '..', 'prompts', 'translate.md');
}

function resolveDefaultJudgePromptPath() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, '..', 'prompts', 'glossary-judge.md');
}

function buildDefaultOutputPath(inputPath) {
  const ext = path.extname(inputPath);
  if (!ext) {
    return `${inputPath}.zh.md`;
  }
  return `${inputPath.slice(0, -ext.length)}.zh${ext}`;
}

function isMarkdownFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ext === '.md' || ext === '.markdown';
}

async function collectMarkdownFiles(rootDir) {
  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.name === '.git' || entry.name === 'node_modules') {
      continue;
    }
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      const nested = await collectMarkdownFiles(fullPath);
      files.push(...nested);
    } else if (entry.isFile() && isMarkdownFile(fullPath)) {
      files.push(fullPath);
    }
  }

  return files.sort();
}

function createProgressHandler(label, stream) {
  const progress = createProgressBar({ label, stream });
  return {
    handle(update) {
      if (!progress.started) {
        progress.start(update.total);
      }
      progress.update(update.done);
      if (update.total === 0 || update.done >= update.total) {
        progress.finish();
      }
    },
    finish() {
      progress.finish();
    }
  };
}

async function translateOneFile({ filePath, outputPath, config, glossary, prompt, judgePrompt, stream }) {
  const label = path.relative(process.cwd(), filePath) || path.basename(filePath);
  const progress = createProgressHandler(label, stream);

  const source = await fs.readFile(filePath, 'utf8');
  const output = await translateMarkdown(source, {
    config,
    glossary,
    prompt,
    judgePrompt,
    onProgress: progress.handle
  });
  progress.finish();

  if (outputPath === '-') {
    process.stdout.write(output);
    return;
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, output, 'utf8');
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    printUsage();
    process.exit(1);
  }

  let inputPath;
  let outputPath;
  let configPath;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '-h' || arg === '--help') {
      printUsage();
      process.exit(0);
    } else if (arg === '-o' || arg === '--output') {
      outputPath = args[i + 1];
      i += 1;
    } else if (arg === '-c' || arg === '--config') {
      configPath = args[i + 1];
      i += 1;
    } else if (!inputPath) {
      inputPath = arg;
    } else {
      console.error(`Unknown argument: ${arg}`);
      printUsage();
      process.exit(1);
    }
  }

  if (!inputPath) {
    printUsage();
    process.exit(1);
  }

  const { configPath: resolvedConfigPath, config } = await loadConfig(configPath);
  const promptPath = config.prompt_path
    ? path.resolve(process.cwd(), config.prompt_path)
    : resolveDefaultPromptPath();
  const judgePromptPath = config.judge_prompt_path
    ? path.resolve(process.cwd(), config.judge_prompt_path)
    : resolveDefaultJudgePromptPath();

  if (!config.api_key) {
    throw new Error('api_key is required. Set it in config or OPENAI_API_KEY.');
  }

  const [glossary, prompt, judgePrompt] = await Promise.all([
    loadGlossary(config),
    loadPrompt(promptPath),
    loadPrompt(judgePromptPath)
  ]);

  const inputStat = await fs.stat(inputPath);

  if (resolvedConfigPath) {
    console.log(`Using config: ${resolvedConfigPath}`);
  }

  if (inputStat.isDirectory()) {
    if (outputPath === '-') {
      throw new Error('Output to stdout is not supported when input is a directory.');
    }

    const files = await collectMarkdownFiles(inputPath);
    if (files.length === 0) {
      console.log('No markdown files found.');
      return;
    }

    const outputRoot = outputPath ? path.resolve(outputPath) : null;
    if (outputRoot) {
      await fs.mkdir(outputRoot, { recursive: true });
    }

    for (const filePath of files) {
      const relative = path.relative(inputPath, filePath);
      const baseOutputPath = outputRoot ? path.join(outputRoot, relative) : filePath;
      const finalOutputPath = buildDefaultOutputPath(baseOutputPath);
      await translateOneFile({
        filePath,
        outputPath: finalOutputPath,
        config,
        glossary,
        prompt,
        judgePrompt,
        stream: process.stdout
      });
    }

    console.log(`Translated ${files.length} markdown files.`);
    return;
  }

  let finalOutputPath = outputPath || buildDefaultOutputPath(inputPath);
  if (outputPath) {
    try {
      const outStat = await fs.stat(outputPath);
      if (outStat.isDirectory()) {
        finalOutputPath = path.join(outputPath, path.basename(buildDefaultOutputPath(inputPath)));
      }
    } catch {
      // ignore missing output path
    }
  }

  const stream = finalOutputPath === '-' ? process.stderr : process.stdout;
  await translateOneFile({
    filePath: inputPath,
    outputPath: finalOutputPath,
    config,
    glossary,
    prompt,
    judgePrompt,
    stream
  });

  if (finalOutputPath !== '-') {
    console.log(`Translated markdown written to: ${finalOutputPath}`);
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
