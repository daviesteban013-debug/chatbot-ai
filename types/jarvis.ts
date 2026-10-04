export type AvatarState = "IDLE" | "LISTENING" | "PROCESSING" | "SPEAKING" | "ERROR";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
  status?: "processing" | "streaming" | "completed" | "error";
  metadata?: Record<string, unknown>;
}

export type AgentStreamStatus = "processing" | "streaming" | "completed" | "error";

export interface AgentStreamPayload {
  status: AgentStreamStatus;
  delta?: string;
  content?: string;
  sessionId: string;
  messageId?: string;
  phase?: "thinking" | "tool_call" | "synthesizing";
  tool?: string;
  error?: string;
  latencyMs?: number;
}

export interface JarvisTelemetry {
  fps: number;
  latencyMs: number;
  audioLevel: number;
  statusText: string;
}
