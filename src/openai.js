function buildChatCompletionsUrl(baseUrl) {
  const trimmed = baseUrl.replace(/\/$/, '');
  if (trimmed.endsWith('/v1')) {
    return `${trimmed}/chat/completions`;
  }
  return `${trimmed}/v1/chat/completions`;
}

function buildHeaders(apiKey) {
  const headers = {
    'Content-Type': 'application/json'
  };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  return headers;
}

function parseRetryAfterMs(value) {
  if (!value) {
    return undefined;
  }
  const asNumber = Number(value);
  if (Number.isFinite(asNumber) && asNumber >= 0) {
    return Math.floor(asNumber * 1000);
  }
  const asDate = Date.parse(value);
  if (Number.isNaN(asDate)) {
    return undefined;
  }
  const delta = asDate - Date.now();
  if (delta <= 0) {
    return 0;
  }
  return delta;
}

export async function chatCompletion({
  baseUrl,
  apiKey,
  model,
  messages,
  temperature,
  max_tokens,
  timeoutMs = 120000
}) {
  const url = buildChatCompletionsUrl(baseUrl);
  const payload = {
    model,
    messages,
    temperature,
    max_tokens
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: buildHeaders(apiKey),
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    const text = await response.text();
    if (!response.ok) {
      const error = new Error(`API error ${response.status}: ${text}`);
      error.statusCode = response.status;
      error.responseBody = text;
      error.retryAfterMs = parseRetryAfterMs(response.headers.get('retry-after'));
      throw error;
    }

    const data = JSON.parse(text);
    const content = data?.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response content from API');
    }

    return content;
  } catch (error) {
    if (error && typeof error === 'object') {
      if (!('isTimeout' in error)) {
        error.isTimeout = error.name === 'AbortError';
      }
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
