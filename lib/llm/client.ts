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

const OPENAI_MODEL = 'gpt-6-luna'

/** Server-only selection: an OpenAI key must never reach a legacy provider URL. */
function connection(modelOverride?: string) {
  const openaiKey = process.env.OPENAI_API_KEY?.trim()
  if (openaiKey) return {
    provider: 'openai' as const, apiKey: openaiKey,
    baseUrl: DEFAULT_BASE_URL, model: OPENAI_MODEL,
  }
  return {
    provider: 'compatible' as const,
    apiKey: process.env.LLM_API_KEY?.trim(),
    baseUrl: (process.env.LLM_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, ''),
    model: modelOverride || process.env.LLM_MODEL?.trim() || DEFAULT_MODEL,
  }
}

export function configuredModel(fallback?: string): string {
  return connection(process.env.LLM_MODEL?.trim() || fallback).model
}

/** Contains no credentials or custom endpoints; safe for local diagnostics. */
export function llmStatus() {
  const config = connection()
  return { provider: config.provider, model: config.model, ready: Boolean(config.apiKey),
    keyVariable: config.provider === 'openai' ? 'OPENAI_API_KEY' : 'LLM_API_KEY' }
}

function completionBody(messages: LLMMessage[], tools: LLMTool[] | undefined, options: ChatOptions | undefined) {
  const config = connection(options?.model)
  if (!config.apiKey) throw new Error('OPENAI_API_KEY o LLM_API_KEY environment variable is required')
  const body: Record<string, unknown> = {
    model: config.model, messages, temperature: options?.temperature ?? DEFAULT_TEMPERATURE,
    ...(config.provider === 'openai'
      // Luna supports Chat Completions function calls with reasoning disabled.
      ? { reasoning_effort: 'none', max_completion_tokens: options?.maxTokens ?? DEFAULT_MAX_TOKENS }
      : { max_tokens: options?.maxTokens ?? DEFAULT_MAX_TOKENS }),
  }
  if (tools?.length) {
    body.tools = tools
    body.tool_choice = options?.toolChoice ?? 'auto'
  }
  return { ...config, body }
}

async function providerError(response: Response): Promise<Error> {
  // Provider bodies can echo credentials, prompts or records. Never forward them.
  await response.body?.cancel().catch(() => {})
  const help = response.status === 401 ? 'Revisa la clave API del proveedor.'
    : response.status === 429 ? 'Revisa el saldo, la cuota y los límites del proveedor.'
    : 'No se pudo completar la solicitud al proveedor.'
  return new Error(`LLM API error ${response.status}: ${help}`)
}

function readUsage(value: unknown): { tokensIn: number; tokensOut: number } {
  const usage = value as { prompt_tokens?: unknown; completion_tokens?: unknown } | null;
  if (!usage || typeof usage.prompt_tokens !== 'number' || typeof usage.completion_tokens !== 'number'
    || !Number.isSafeInteger(usage.prompt_tokens) || !Number.isSafeInteger(usage.completion_tokens)
    || usage.prompt_tokens < 0 || usage.completion_tokens < 0) {
    throw new Error('El proveedor no informó un consumo de tokens válido. La reserva queda pendiente de revisión.');
  }
  return { tokensIn: usage.prompt_tokens, tokensOut: usage.completion_tokens };
}

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
  const { baseUrl, apiKey, model, body } = completionBody(messages, tools, options)

  const startTime = Date.now()
  const signal = options?.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(45_000)]) : AbortSignal.timeout(45_000)
  let lastError: Error | null = null

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      signal.throwIfAborted()
      options?.onAccepted?.()
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal,
      })

      if (!response.ok) options?.onRejected?.()

      // Reintentar en 429 o 5xx
      if (response.status === 429 || response.status >= 500) {
        const retryAfter = response.headers.get('retry-after')
        const delay = retryAfter
          ? parseInt(retryAfter, 10) * 1000
          : BASE_DELAY_MS * Math.pow(2, attempt)

        if (attempt < MAX_RETRIES - 1) {
          await response.body?.cancel()
          await sleep(delay)
          continue
        }
        throw await providerError(response)
      }

      if (!response.ok) {
        throw await providerError(response)
      }

      const data = await response.json()
      const usage = readUsage(data.usage)
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
        tokensIn: usage.tokensIn,
        tokensOut: usage.tokensOut,
        latencyMs,
        model: data.model || model,
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      // No reintentar errores que no sean de red/estado
      if (!options?.onAccepted && !signal.aborted && attempt < MAX_RETRIES - 1 && isRetryable(lastError)) {
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
  | { type: "usage"; model: string; tokensIn: number; tokensOut: number }
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
  const { baseUrl, apiKey, model, body } = completionBody(messages, tools, options);
  body.stream = true;
  body.stream_options = { include_usage: true };

  const signal = options?.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(45_000)]) : AbortSignal.timeout(45_000);
  signal.throwIfAborted();
  options?.onAccepted?.();
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    options?.onRejected?.();
    throw await providerError(response);
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
  let hasUsage = false;
  let finishReceived = false;
  let sawDone = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += done ? decoder.decode() + '\n' : decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;

        const dataStr = trimmed.slice(5).trim();
        if (dataStr === '[DONE]') {
          sawDone = true;
          continue;
        }

        const parsed = JSON.parse(dataStr);
        if (parsed.error) throw new Error('El proveedor interrumpió la respuesta.');
        if (parsed.model) responseModel = parsed.model;
        if (parsed.choices?.some((c: { finish_reason?: string | null }) => c.finish_reason)) finishReceived = true;
        // Some compatible providers emit provisional usage on text chunks.
        // Groq may repeat identical totals on the finish chunk and final usage chunk.
        // Validate all final reports before emitting one authoritative usage event.
        if (parsed.usage && finishReceived) {
          const usage = readUsage(parsed.usage);
          if (hasUsage && (tokensIn !== usage.tokensIn || tokensOut !== usage.tokensOut)) {
            throw new Error('El proveedor informó un consumo final inconsistente. La reserva queda pendiente de revisión.');
          }
          tokensIn = usage.tokensIn;
          tokensOut = usage.tokensOut;
          hasUsage = true;
        }

        const choice = parsed.choices?.[0];
        if (!choice) continue;

        const delta = choice.delta;
        if (delta?.content) {
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
      }
      if (done || sawDone) break;
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }

  if (!hasUsage) throw new Error('El proveedor no informó el consumo de tokens. La reserva queda pendiente de revisión.');
  if (!sawDone) throw new Error('La respuesta del proveedor se interrumpió.');

  yield { type: 'usage', model: responseModel, tokensIn, tokensOut };

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

