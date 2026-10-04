/**
 * Cliente LLM agnóstico del proveedor, compatible con el formato de la API de
 * OpenAI. Soporta cualquier endpoint que implemente /chat/completions
 * (OpenAI, Groq, Together, DeepInfra, vLLM, etc.) vía LLM_BASE_URL.
 *
 * Incluye reintentos con backoff exponencial para 429 y 5xx.
 */

import type {
  ChatOptions,
  LLMMessage,
  LLMResponse,
  LLMTool,
  LLMToolCall,
} from './types'

const MAX_RETRIES = 3
const BASE_DELAY_MS = 1000
const DEFAULT_BASE_URL = 'https://api.openai.com/v1'
const DEFAULT_MODEL = 'gpt-4o-mini'
const DEFAULT_TEMPERATURE = 0.2
const DEFAULT_MAX_TOKENS = 2048

/**
 * Chat completion agnóstico del proveedor compatible con el formato de OpenAI.
 * Soporta cualquier endpoint que implemente /chat/completions.
 * Reintenta en 429 y 5xx con backoff exponencial.
 */
export async function chatCompletion(
  messages: LLMMessage[],
  tools?: LLMTool[],
  options?: ChatOptions
): Promise<LLMResponse> {
  const baseUrl = process.env.LLM_BASE_URL || DEFAULT_BASE_URL
  const apiKey = process.env.LLM_API_KEY
  const model = options?.model || process.env.LLM_MODEL || DEFAULT_MODEL
  const temperature = options?.temperature ?? DEFAULT_TEMPERATURE
  const maxTokens = options?.maxTokens ?? DEFAULT_MAX_TOKENS
  const toolChoice = options?.toolChoice ?? 'auto'

  if (!apiKey) {
    throw new Error('LLM_API_KEY environment variable is required')
  }

  const body: Record<string, unknown> = {
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
  }

  if (tools && tools.length > 0) {
    body.tools = tools
    body.tool_choice = toolChoice
  }

  const startTime = Date.now()
  let lastError: Error | null = null

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })

      // Reintentar en 429 o 5xx
      if (response.status === 429 || response.status >= 500) {
        const retryAfter = response.headers.get('retry-after')
        const delay = retryAfter
          ? parseInt(retryAfter, 10) * 1000
          : BASE_DELAY_MS * Math.pow(2, attempt)

        if (attempt < MAX_RETRIES) {
          await sleep(delay)
          continue
        }
        throw new Error(
          `LLM API error ${response.status}: ${await response.text()}`
        )
      }

      if (!response.ok) {
        throw new Error(
          `LLM API error ${response.status}: ${await response.text()}`
        )
      }

      const data = await response.json()
      const latencyMs = Date.now() - startTime
      const choice = data.choices?.[0]

      if (!choice) {
        throw new Error('LLM API returned no choices')
      }

      const message = choice.message
      const rawToolCalls: RawToolCall[] = message.tool_calls || []
      const toolCalls: LLMToolCall[] = rawToolCalls.map((tc) => ({
        id: tc.id,
        type: 'function' as const,
        function: {
          name: tc.function?.name ?? '',
          arguments: tc.function?.arguments || '{}',
        },
      }))

      return {
        content: message.content || null,
        toolCalls,
        tokensIn: data.usage?.prompt_tokens ?? 0,
        tokensOut: data.usage?.completion_tokens ?? 0,
        latencyMs,
        model: data.model || model,
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      // No reintentar errores que no sean de red/estado
      if (attempt < MAX_RETRIES && isRetryable(lastError)) {
        await sleep(BASE_DELAY_MS * Math.pow(2, attempt))
        continue
      }
      throw lastError
    }
  }

  throw lastError || new Error('LLM request failed after retries')
}

/**
 * Calcula el costo en USD según los precios configurados por env var.
 * Usa LLM_PRICE_IN_PER_MTOK y LLM_PRICE_OUT_PER_MTOK (precio por millón de tokens).
 */
export function calculateCost(tokensIn: number, tokensOut: number): number {
  const priceIn = parseFloat(process.env.LLM_PRICE_IN_PER_MTOK || '0')
  const priceOut = parseFloat(process.env.LLM_PRICE_OUT_PER_MTOK || '0')
  return (tokensIn * priceIn + tokensOut * priceOut) / 1_000_000
}

/** Forma mínima del tool call devuelto por el endpoint. */
interface RawToolCall {
  id: string
  function?: {
    name?: string
    arguments?: string
  }
}

function isRetryable(error: Error): boolean {
  // Errores de red y timeouts
  if (
    error.message.includes('fetch') ||
    error.message.includes('ECONNRESET') ||
    error.message.includes('timeout')
  ) {
    return true
  }
  return false
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export type LLMStreamEvent =
  | { type: "delta"; content: string }
  | { type: "tool_calls"; toolCalls: LLMToolCall[] }
  | { type: "done"; model: string; tokensIn: number; tokensOut: number };

/**
 * Chat completion en streaming agnóstico del proveedor.
 * Emite chunks de texto en tiempo real con SSE y acumula tool calls si los hay.
 */
export async function* chatCompletionStream(
  messages: LLMMessage[],
  tools?: LLMTool[],
  options?: ChatOptions
): AsyncGenerator<LLMStreamEvent, void, unknown> {
  const baseUrl = process.env.LLM_BASE_URL || DEFAULT_BASE_URL;
  const apiKey = process.env.LLM_API_KEY;
  const model = options?.model || process.env.LLM_MODEL || DEFAULT_MODEL;
  const temperature = options?.temperature ?? DEFAULT_TEMPERATURE;
  const maxTokens = options?.maxTokens ?? DEFAULT_MAX_TOKENS;
  const toolChoice = options?.toolChoice ?? 'auto';

  if (!apiKey) {
    throw new Error('LLM_API_KEY environment variable is required');
  }

  const body: Record<string, unknown> = {
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
    stream: true,
  };

  if (tools && tools.length > 0) {
    body.tools = tools;
    body.tool_choice = toolChoice;
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`LLM stream error ${response.status}: ${errorText}`);
  }

  if (!response.body) {
    throw new Error('LLM stream error: response body is null');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const accumulatedToolCalls: Map<
    number,
    { id: string; name: string; arguments: string }
  > = new Map();

  let tokensIn = 0;
  let tokensOut = 0;
  let responseModel = model;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;

        const dataStr = trimmed.slice(5).trim();
        if (dataStr === '[DONE]') {
          continue;
        }

        try {
          const parsed = JSON.parse(dataStr);
          if (parsed.model) responseModel = parsed.model;
          if (parsed.usage) {
            tokensIn = parsed.usage.prompt_tokens ?? tokensIn;
            tokensOut = parsed.usage.completion_tokens ?? tokensOut;
          }

          const choice = parsed.choices?.[0];
          if (!choice) continue;

          const delta = choice.delta;
          if (delta?.content) {
            tokensOut += 1;
            yield { type: 'delta', content: delta.content };
          }

          if (delta?.tool_calls && Array.isArray(delta.tool_calls)) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0;
              const existing = accumulatedToolCalls.get(idx) || {
                id: tc.id || '',
                name: '',
                arguments: '',
              };
              if (tc.id) existing.id = tc.id;
              if (tc.function?.name) existing.name += tc.function.name;
              if (tc.function?.arguments) existing.arguments += tc.function.arguments;
              accumulatedToolCalls.set(idx, existing);
            }
          }
        } catch {
          // Fragmento no parseable, omitir
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (accumulatedToolCalls.size > 0) {
    const toolCalls: LLMToolCall[] = Array.from(accumulatedToolCalls.values()).map(
      (tc) => ({
        id: tc.id || `call_${Math.random().toString(36).slice(2, 9)}`,
        type: 'function' as const,
        function: {
          name: tc.name,
          arguments: tc.arguments || '{}',
        },
      })
    );
    yield { type: 'tool_calls', toolCalls };
  }

  yield {
    type: 'done',
    model: responseModel,
    tokensIn,
    tokensOut,
  };
}

