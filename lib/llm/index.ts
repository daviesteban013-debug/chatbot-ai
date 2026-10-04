/**
 * Capa de abstracción LLM canónica.
 * Re-exporta el cliente, los tipos y la transcripción de audio.
 */

export { chatCompletion, chatCompletionStream, calculateCost } from './client'
export type { LLMStreamEvent } from './client'
export { transcribeAudio } from './transcribe'
export type {
  LLMResponse,
  LLMMessage,
  LLMToolCall,
  LLMTool,
  ChatOptions,
} from './types'
