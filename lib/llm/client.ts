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

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
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
