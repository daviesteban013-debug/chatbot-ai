import type { JarvisPersonalization } from "@/lib/jarvis-personalization";
import type { HandoffTrace, SpecialistId } from "@/lib/agent/team";
import type { OrderProposal } from "@/lib/order-proposals";
import type { OperatorAction } from "@/lib/crm-operator";

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
  phase?: "thinking" | "tool_call" | "synthesizing" | "delegating" | "operating";
  agent?: SpecialistId;
  agentLabel?: string;
  handoffs?: HandoffTrace[];
  orderProposals?: OrderProposal[];
  operation?: OperatorAction;
  operatorActions?: OperatorAction[];
  tool?: string;
  error?: string;
  latencyMs?: number;
  personalization?: JarvisPersonalization;
}

export interface JarvisTelemetry {
  fps: number;
  latencyMs: number;
  audioLevel: number;
  statusText: string;
}
