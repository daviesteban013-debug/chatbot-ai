/**
 * Capa de abstracción LLM canónica.
 * Re-exporta el cliente, los tipos y la transcripción de audio.
 */

export { chatCompletion, calculateCost } from './client'
export { transcribeAudio } from './transcribe'
export type {
  LLMResponse,
  LLMMessage,
  LLMToolCall,
  LLMTool,
  ChatOptions,
} from './types'
