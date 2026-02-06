/**
 * OpenAI API Service
 * 提供 OpenAI 兼容 API 的 Chat Completion 调用
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatCompletionParams {
  baseUrl: string
  apiKey: string
  model: string
  messages: ChatMessage[]
  temperature: number
  max_tokens: number
  timeoutMs?: number
}

export interface ChatCompletionError extends Error {
  isCorsError?: boolean
  isTimeout?: boolean
  statusCode?: number
}

export interface ChatCompletionResponse {
  id: string
  object: string
  created: number
  model: string
  choices: Array<{
    index: number
    message: {
      role: string
      content: string
    }
    finish_reason: string
  }>
  usage: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

/**
 * 构建 Chat Completions API URL
 * 自动处理 baseUrl 末尾的 /v1
 */
export function buildChatCompletionsUrl(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/$/, '')
  if (trimmed.endsWith('/v1')) {
    return `${trimmed}/chat/completions`
  }
  return `${trimmed}/v1/chat/completions`
}

/**
 * 构建请求头
 */
export function buildHeaders(apiKey: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  }
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`
  }
  return headers
}

/**
 * 检测是否为 CORS 错误
 * CORS 错误通常是 TypeError 且消息包含特定内容
 */
function isCorsError(error: Error): boolean {
  return (
    error instanceof TypeError &&
    (error.message.includes('fetch') ||
      error.message.includes('CORS') ||
      error.message.includes('Failed to fetch') ||
      error.message.includes('NetworkError'))
  )
}

/**
 * 创建 CORS 错误消息
 */
function createCorsErrorMessage(): string {
  return `CORS 错误：浏览器无法直接访问该 API。

可能的原因：
1. API 服务器未配置 CORS 头
2. 需要配置代理服务器

解决方案：
1. 使用支持 CORS 的代理服务器（如 Cloudflare Worker）
2. 在配置中设置代理 URL
3. 联系 API 提供商启用 CORS

示例代理配置：
https://github.com/your-proxy-server`
}

/**
 * 检测是否为超时错误
 */
function isTimeoutError(error: Error): boolean {
  return (
    error.name === 'AbortError' ||
    (error instanceof Error && error.message.includes('aborted'))
  )
}

/**
 * Chat Completion 主函数
 * 调用 OpenAI 兼容 API 获取翻译结果
 *
 * @param params - API 调用参数
 * @returns 翻译后的文本内容
 * @throws ChatCompletionError - 包含详细的错误信息
 */
export async function chatCompletion(
  params: ChatCompletionParams
): Promise<string> {
  const {
    baseUrl,
    apiKey,
    model,
    messages,
    temperature,
    max_tokens,
    timeoutMs = 60000
  } = params

  const url = buildChatCompletionsUrl(baseUrl)
  const payload = {
    model,
    messages,
    temperature,
    max_tokens
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: buildHeaders(apiKey),
      body: JSON.stringify(payload),
      signal: controller.signal
    })

    const text = await response.text()

    // HTTP 错误处理
    if (!response.ok) {
      const error = new Error(`API error ${response.status}: ${text}`) as ChatCompletionError
      error.statusCode = response.status
      error.isCorsError = false
      error.isTimeout = false
      throw error
    }

    // 解析响应
    const data = JSON.parse(text) as ChatCompletionResponse
    const choice = data.choices?.[0]
    const message = choice?.message
    const content = message?.content

    if (!content) {
      const error = new Error('Empty response content from API') as ChatCompletionError
      error.statusCode = undefined
      error.isCorsError = false
      error.isTimeout = false
      throw error
    }

    return content
  } catch (error) {
    // 转换为 ChatCompletionError
    if (error instanceof Error) {
      const chatError = error as ChatCompletionError

      // CORS 错误检测
      if (isCorsError(error)) {
        const corsError = new Error(createCorsErrorMessage()) as ChatCompletionError
        corsError.isCorsError = true
        corsError.isTimeout = false
        corsError.statusCode = undefined
        throw corsError
      }

      // 超时错误检测
      if (isTimeoutError(error)) {
        const timeoutError = new Error(
          `请求超时（${timeoutMs}ms）：服务器响应时间过长，请稍后重试或尝试减少文本长度`
        ) as ChatCompletionError
        timeoutError.isTimeout = true
        timeoutError.isCorsError = false
        timeoutError.statusCode = undefined
        throw timeoutError
      }

      // 其他错误直接抛出
      chatError.isCorsError = false
      chatError.isTimeout = false
      throw chatError
    }

    // 未知错误
    const unknownError = new Error('Unknown error occurred') as ChatCompletionError
    unknownError.isCorsError = false
    unknownError.isTimeout = false
    unknownError.statusCode = undefined
    throw unknownError
  } finally {
    clearTimeout(timeout)
  }
}
