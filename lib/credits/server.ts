import { createAdminClient } from "@/lib/supabase/admin";
import type { CreditBalance } from "@/lib/credits";
import type { LLMMessage, LLMTool } from "@/lib/llm/types";

export interface CreditAccount { tenantId?: string | null; userId?: string | null; channel: "web" | "whatsapp" }
export class CreditError extends Error {
  constructor(public readonly code: "CREDITS_EXHAUSTED" | "CREDITS_UNAVAILABLE", message: string) { super(message); }
}

function unavailable(): never {
  throw new CreditError("CREDITS_UNAVAILABLE", "No se pudo verificar tu saldo de créditos. Inténtalo más tarde.");
}

export async function getCreditBalance(account: CreditAccount): Promise<CreditBalance> {
  const { data, error } = await createAdminClient().rpc("credit_balance", {
    p_tenant_id: account.tenantId ?? null, p_user_id: account.userId ?? null,
  });
  if (error || !data || typeof data !== "object" || Array.isArray(data)) unavailable();
  const values = [data.quotaTokens, data.usedTokens, data.reservedTokens, data.availableTokens];
  if (!values.every(v => typeof v === "number" && Number.isSafeInteger(v) && v >= 0)
    || typeof data.ownerKey !== "string" || typeof data.periodStart !== "string"
    || typeof data.resetsAt !== "string" || typeof data.plan !== "string") unavailable();
  return data as unknown as CreditBalance;
}

/** Conservative reservation, never a charge: final billing uses only reported usage. */
export function inputReservation(messages: LLMMessage[], tools?: LLMTool[]): number {
  return new TextEncoder().encode(JSON.stringify({ messages, tools })).length + 512 + messages.length * 32;
}

export async function reserveCredits(account: CreditAccount, inputTokens: number, outputTokens: number) {
  if (!Number.isSafeInteger(outputTokens) || outputTokens <= 0 || outputTokens > 32_768) unavailable();
  const id = crypto.randomUUID();
  const { data, error } = await createAdminClient().rpc("reserve_credits", {
    p_id: id, p_tenant_id: account.tenantId ?? null, p_user_id: account.userId ?? null,
    p_requested: inputTokens + outputTokens, p_minimum: inputTokens + Math.min(64, outputTokens), p_channel: account.channel,
  });
  if (error || !data || typeof data !== "object" || Array.isArray(data)) unavailable();
  if (data.ok === false) throw new CreditError("CREDITS_EXHAUSTED", "No tienes suficientes créditos disponibles para esta respuesta. Revisa tu saldo y la fecha de renovación.");
  if (data.ok !== true || typeof data.reservedTokens !== "number" || !Number.isSafeInteger(data.reservedTokens)
    || data.reservedTokens <= inputTokens || data.reservedTokens > inputTokens + outputTokens) unavailable();
  return { id, maxTokens: data.reservedTokens - inputTokens };
}

export async function settleCredits(id: string, tokensIn: number, tokensOut: number, model: string) {
  if (![tokensIn, tokensOut].every(v => Number.isSafeInteger(v) && v >= 0)) unavailable();
  const { error } = await createAdminClient().rpc("settle_credits", { p_id: id, p_tokens_in: tokensIn, p_tokens_out: tokensOut, p_model: model });
  if (error) unavailable();
}

export async function releaseCredits(id: string) {
  const { error } = await createAdminClient().rpc("release_credits", { p_id: id });
  if (error) unavailable();
}
