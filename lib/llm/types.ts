/**
 * Tipos canónicos de la capa de abstracción LLM.
 * Independientes del proveedor: cualquier endpoint compatible con el formato
 * de OpenAI (/chat/completions) puede implementarlos.
 */

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: LLMToolCall[]
  tool_call_id?: string
  name?: string
}

export interface LLMToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    /** Cadena JSON con los argumentos del tool call */
    arguments: string
  }
}

export interface LLMTool {
  type: 'function'
  function: {
    name: string
    description: string
    /** JSON Schema de los parámetros */
    parameters: Record<string, unknown>
  }
}

export interface LLMResponse {
  /** Texto final generado por el modelo (null si solo hizo tool calls) */
  content: string | null
  /** Tool calls solicitados por el modelo */
  toolCalls: LLMToolCall[]
  /** Tokens de entrada usados */
  tokensIn: number
  /** Tokens de salida generados */
  tokensOut: number
  /** Latencia en ms */
  latencyMs: number
  /** Modelo usado */
  model: string
}

export interface ChatOptions {
  signal?: AbortSignal;
  /** Internal hook: a request may consume tokens after reaching the provider. */
  onAccepted?: () => void;
  onRejected?: () => void;
  model?: string
  /** default 0.2 (la especificación exige ≤ 0.3) */
  temperature?: number
  /** default 2048 */
  maxTokens?: number
  toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } }
}
