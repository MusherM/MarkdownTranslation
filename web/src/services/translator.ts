import { translateMarkdown as sharedTranslateMarkdown } from '../../../src/translate.js'

export interface TranslatorConfig {
  base_url: string
  api_key: string
  model: string
  retry_times: number
  temperature: number
  max_tokens: number
  timeout_ms?: number
  max_batch_chars?: number
  max_batch_tokens?: number
  max_batch_segments: number
  retry_base_delay_ms?: number
  retry_max_delay_ms?: number
}

export type Glossary = Record<string, string>

export type ChatMessage = {
  role: string
  content: string
}

export type ChatCompletionFunction = (params: {
  baseUrl: string
  apiKey: string
  model: string
  messages: ChatMessage[]
  temperature: number
  max_tokens: number
  timeoutMs?: number
}) => Promise<string>

export interface TranslatorLogger {
  error?: (event: string, payload: unknown) => void | Promise<void>
  warn?: (event: string, payload: unknown) => void | Promise<void>
}

export type ProgressUpdate = {
  done: number
  total: number
}

export type TranslateMarkdownOptions = {
  config: TranslatorConfig
  glossary: Glossary
  prompt: string
  judgePrompt?: string
  translateMarkdownCodeBlocks?: boolean
  onProgress?: (update: ProgressUpdate) => void
  chatCompletion: ChatCompletionFunction
  logger?: TranslatorLogger
}

type RuntimeTranslatorConfig = TranslatorConfig & {
  timeout_ms: number
  max_batch_chars: number
  max_batch_tokens: number
  retry_base_delay_ms: number
  retry_max_delay_ms: number
}

const DEFAULT_TIMEOUT_MS = 120000
const DEFAULT_MAX_BATCH_TOKENS = 3000
const DEFAULT_BATCH_CHARS_PER_TOKEN = 8
const DEFAULT_MIN_BATCH_CHARS = 4000
const DEFAULT_RETRY_BASE_DELAY_MS = 500
const DEFAULT_RETRY_MAX_DELAY_MS = 8000

function ensureNonEmptyString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Invalid config "${fieldName}": expected a non-empty string`)
  }
  return value
}

function ensureInteger(
  value: unknown,
  fieldName: string,
  bounds: { min?: number; max?: number } = {}
): number {
  const min = bounds.min ?? Number.NEGATIVE_INFINITY
  const max = bounds.max ?? Number.POSITIVE_INFINITY
  const numeric = Number(value)
  if (!Number.isInteger(numeric) || numeric < min || numeric > max) {
    throw new Error(
      `Invalid config "${fieldName}": expected integer in [${min}, ${max}], got ${String(value)}`
    )
  }
  return numeric
}

function ensureNumber(
  value: unknown,
  fieldName: string,
  bounds: { min?: number; max?: number } = {}
): number {
  const min = bounds.min ?? Number.NEGATIVE_INFINITY
  const max = bounds.max ?? Number.POSITIVE_INFINITY
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric < min || numeric > max) {
    throw new Error(
      `Invalid config "${fieldName}": expected number in [${min}, ${max}], got ${String(value)}`
    )
  }
  return numeric
}

function hasConfigValue(value: unknown): boolean {
  if (value === undefined || value === null) {
    return false
  }
  if (typeof value === 'string' && value.trim().length === 0) {
    return false
  }
  return true
}

function deriveMaxBatchChars(maxBatchTokens: number): number {
  return Math.max(
    DEFAULT_MIN_BATCH_CHARS,
    Math.ceil(maxBatchTokens * DEFAULT_BATCH_CHARS_PER_TOKEN)
  )
}

function normalizeTranslatorConfig(config: TranslatorConfig): RuntimeTranslatorConfig {
  const initialMaxBatchTokens = config.max_batch_tokens ?? DEFAULT_MAX_BATCH_TOKENS
  const normalized: RuntimeTranslatorConfig = {
    ...config,
    timeout_ms: config.timeout_ms ?? DEFAULT_TIMEOUT_MS,
    max_batch_chars: hasConfigValue(config.max_batch_chars)
      ? Number(config.max_batch_chars)
      : deriveMaxBatchChars(Number(initialMaxBatchTokens)),
    max_batch_tokens: initialMaxBatchTokens,
    retry_base_delay_ms: config.retry_base_delay_ms ?? DEFAULT_RETRY_BASE_DELAY_MS,
    retry_max_delay_ms: config.retry_max_delay_ms ?? DEFAULT_RETRY_MAX_DELAY_MS
  }

  normalized.base_url = ensureNonEmptyString(normalized.base_url, 'base_url')
  normalized.model = ensureNonEmptyString(normalized.model, 'model')

  normalized.retry_times = ensureInteger(normalized.retry_times, 'retry_times', { min: 1, max: 20 })
  normalized.temperature = ensureNumber(normalized.temperature, 'temperature', { min: 0, max: 2 })
  normalized.max_tokens = ensureInteger(normalized.max_tokens, 'max_tokens', { min: 1 })
  normalized.timeout_ms = ensureInteger(normalized.timeout_ms, 'timeout_ms', { min: 1000 })
  normalized.max_batch_tokens = ensureInteger(normalized.max_batch_tokens, 'max_batch_tokens', { min: 128 })
  normalized.max_batch_chars = ensureInteger(normalized.max_batch_chars, 'max_batch_chars', { min: 1 })
  normalized.max_batch_segments = ensureInteger(normalized.max_batch_segments, 'max_batch_segments', { min: 1 })
  normalized.retry_base_delay_ms = ensureInteger(
    normalized.retry_base_delay_ms,
    'retry_base_delay_ms',
    { min: 0, max: 60000 }
  )
  normalized.retry_max_delay_ms = ensureInteger(
    normalized.retry_max_delay_ms,
    'retry_max_delay_ms',
    { min: 100, max: 120000 }
  )

  if (normalized.retry_max_delay_ms < normalized.retry_base_delay_ms) {
    throw new Error(
      'Invalid config "retry_max_delay_ms": must be greater than or equal to retry_base_delay_ms'
    )
  }

  return normalized
}

export async function translateMarkdown(source: string, options: TranslateMarkdownOptions): Promise<string> {
  const normalizedOptions = {
    ...options,
    config: normalizeTranslatorConfig(options.config)
  }
  return sharedTranslateMarkdown(source, normalizedOptions)
}
