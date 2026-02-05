#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadConfig } from './config.js';
import { loadGlossary } from './glossary.js';
import { loadPrompt } from './prompt.js';
import { translateMarkdown } from './translate.js';

function printUsage() {
  console.log(`Usage: md-translate <input.md> [options]

Options:
  -c, --config <path>   Path to config.jsonc or config.json
  -o, --output <path>   Output markdown path (default: input.zh.md)
  -h, --help            Show this help
`);
}

function resolveDefaultPromptPath() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, '..', 'prompts', 'translate.md');
}

function buildDefaultOutputPath(inputPath) {
  const ext = path.extname(inputPath);
  if (!ext) {
    return `${inputPath}.zh.md`;
  }
  return `${inputPath.slice(0, -ext.length)}.zh${ext}`;
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

  if (!config.api_key) {
    throw new Error('api_key is required. Set it in config or OPENAI_API_KEY.');
  }

  const [source, glossary, prompt] = await Promise.all([
    fs.readFile(inputPath, 'utf8'),
    loadGlossary(config),
    loadPrompt(promptPath)
  ]);

  const output = await translateMarkdown(source, { config, glossary, prompt });

  const finalOutputPath = outputPath || buildDefaultOutputPath(inputPath);
  if (finalOutputPath === '-') {
    process.stdout.write(output);
    return;
  }

  await fs.writeFile(finalOutputPath, output, 'utf8');

  if (resolvedConfigPath) {
    console.log(`Using config: ${resolvedConfigPath}`);
  }
  console.log(`Translated markdown written to: ${finalOutputPath}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
