import fs from 'fs/promises';
import path from 'path';
import { parse } from 'jsonc-parser';

const DEFAULTS = {
  base_url: 'https://api.openai.com/v1',
  retry_times: 3,
  model: 'gpt-4o-mini',
  temperature: 0.2,
  max_tokens: 2048,
  max_batch_chars: 4000,
  max_batch_segments: 100
};

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJsoncFile(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  const data = parse(raw);
  if (typeof data !== 'object' || data === null) {
    throw new Error(`Config must be a JSON object: ${filePath}`);
  }
  return data;
}

export async function loadConfig(configPath) {
  let resolvedPath = configPath;
  if (!resolvedPath) {
    const cwd = process.cwd();
    const jsoncPath = path.join(cwd, 'config.jsonc');
    const jsonPath = path.join(cwd, 'config.json');
    if (await fileExists(jsoncPath)) {
      resolvedPath = jsoncPath;
    } else if (await fileExists(jsonPath)) {
      resolvedPath = jsonPath;
    }
  }

  const fileConfig = resolvedPath ? await readJsoncFile(resolvedPath) : {};

  const envConfig = {
    base_url: process.env.OPENAI_BASE_URL || undefined,
    api_key: process.env.OPENAI_API_KEY || undefined
  };

  const merged = {
    ...DEFAULTS,
    ...fileConfig
  };

  if (envConfig.base_url) {
    merged.base_url = envConfig.base_url;
  }
  if (!merged.api_key && envConfig.api_key) {
    merged.api_key = envConfig.api_key;
  }

  merged.retry_times = Number(merged.retry_times ?? DEFAULTS.retry_times);
  merged.temperature = Number(merged.temperature ?? DEFAULTS.temperature);
  merged.max_tokens = Number(merged.max_tokens ?? DEFAULTS.max_tokens);
  merged.max_batch_chars = Number(merged.max_batch_chars ?? DEFAULTS.max_batch_chars);
  merged.max_batch_segments = Number(merged.max_batch_segments ?? DEFAULTS.max_batch_segments);

  return {
    configPath: resolvedPath,
    config: merged
  };
}
