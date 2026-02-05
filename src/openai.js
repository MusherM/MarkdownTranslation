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

export async function chatCompletion({
  baseUrl,
  apiKey,
  model,
  messages,
  temperature,
  max_tokens,
  timeoutMs = 60000
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
      throw new Error(`API error ${response.status}: ${text}`);
    }

    const data = JSON.parse(text);
    const content = data?.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response content from API');
    }

    return content;
  } finally {
    clearTimeout(timeout);
  }
}
