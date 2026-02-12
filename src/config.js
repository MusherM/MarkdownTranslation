import fs from 'fs/promises';
import path from 'path';
import { parse } from 'jsonc-parser';

const DEFAULTS = {
  base_url: 'https://api.openai.com/v1',
  retry_times: 3,
  model: 'gpt-4o-mini',
  temperature: 0.2,
  max_tokens: 2048,
  timeout_ms: 120000,
  max_batch_tokens: 3000,
  max_batch_segments: 100,
  retry_base_delay_ms: 500,
  retry_max_delay_ms: 8000,
  log_path: 'log.txt'
};

const DEFAULT_BATCH_CHARS_PER_TOKEN = 8;
const DEFAULT_MIN_BATCH_CHARS = 4000;

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

function hasConfigValue(value) {
  if (value === undefined || value === null) {
    return false;
  }
  if (typeof value === 'string' && value.trim().length === 0) {
    return false;
  }
  return true;
}

function parseOptionalNumber(value) {
  if (!hasConfigValue(value)) {
    return undefined;
  }
  return Number(value);
}

function deriveMaxBatchChars(maxBatchTokens) {
  return Math.max(
    DEFAULT_MIN_BATCH_CHARS,
    Math.ceil(maxBatchTokens * DEFAULT_BATCH_CHARS_PER_TOKEN)
  );
}

function ensureNonEmptyString(value, fieldName) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Invalid config "${fieldName}": expected a non-empty string`);
  }
  return value;
}

function ensureInteger(value, fieldName, { min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY } = {}) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric < min || numeric > max) {
    throw new Error(
      `Invalid config "${fieldName}": expected integer in [${min}, ${max}], got ${value}`
    );
  }
  return numeric;
}

function ensureNumber(value, fieldName, { min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY } = {}) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < min || numeric > max) {
    throw new Error(
      `Invalid config "${fieldName}": expected number in [${min}, ${max}], got ${value}`
    );
  }
  return numeric;
}

function validateAndNormalizeConfig(config) {
  const normalized = {
    ...config
  };

  normalized.base_url = ensureNonEmptyString(normalized.base_url, 'base_url');
  normalized.model = ensureNonEmptyString(normalized.model, 'model');
  normalized.log_path = ensureNonEmptyString(normalized.log_path, 'log_path');

  normalized.retry_times = ensureInteger(normalized.retry_times, 'retry_times', { min: 1, max: 20 });
  normalized.temperature = ensureNumber(normalized.temperature, 'temperature', { min: 0, max: 2 });
  normalized.max_tokens = ensureInteger(normalized.max_tokens, 'max_tokens', { min: 1 });
  normalized.timeout_ms = ensureInteger(normalized.timeout_ms, 'timeout_ms', { min: 1000 });
  normalized.max_batch_tokens = ensureInteger(normalized.max_batch_tokens, 'max_batch_tokens', { min: 128 });
  if (hasConfigValue(normalized.max_batch_chars)) {
    normalized.max_batch_chars = ensureInteger(normalized.max_batch_chars, 'max_batch_chars', { min: 1 });
  } else {
    normalized.max_batch_chars = deriveMaxBatchChars(normalized.max_batch_tokens);
  }
  normalized.max_batch_segments = ensureInteger(normalized.max_batch_segments, 'max_batch_segments', { min: 1 });
  normalized.retry_base_delay_ms = ensureInteger(normalized.retry_base_delay_ms, 'retry_base_delay_ms', { min: 0, max: 60000 });
  normalized.retry_max_delay_ms = ensureInteger(normalized.retry_max_delay_ms, 'retry_max_delay_ms', { min: 100, max: 120000 });

  if (normalized.retry_max_delay_ms < normalized.retry_base_delay_ms) {
    throw new Error('Invalid config "retry_max_delay_ms": must be greater than or equal to retry_base_delay_ms');
  }

  return normalized;
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
  merged.timeout_ms = Number(merged.timeout_ms ?? DEFAULTS.timeout_ms);
  merged.max_batch_tokens = Number(merged.max_batch_tokens ?? DEFAULTS.max_batch_tokens);
  merged.max_batch_chars = parseOptionalNumber(merged.max_batch_chars);
  merged.max_batch_segments = Number(merged.max_batch_segments ?? DEFAULTS.max_batch_segments);
  merged.retry_base_delay_ms = Number(merged.retry_base_delay_ms ?? DEFAULTS.retry_base_delay_ms);
  merged.retry_max_delay_ms = Number(merged.retry_max_delay_ms ?? DEFAULTS.retry_max_delay_ms);

  const validated = validateAndNormalizeConfig(merged);

  return {
    configPath: resolvedPath,
    config: validated
  };
}
