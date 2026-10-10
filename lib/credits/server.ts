import { createAdminClient } from "@/lib/supabase/admin";
import type { CreditBalance, MessageBalance } from "@/lib/credits";
import type { LLMMessage, LLMTool } from "@/lib/llm/types";

export interface CreditAccount { tenantId?: string | null; userId?: string | null; channel: "web" | "whatsapp"; messageReservationId?: string }
export class CreditError extends Error {
  constructor(public readonly code: "CREDITS_EXHAUSTED" | "CREDITS_UNAVAILABLE" | "MESSAGES_EXHAUSTED" | "MESSAGES_RETRY_LIMIT", message: string) { super(message); }
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
  if (account.channel === "web" && account.messageReservationId) {
    const { data, error } = await createAdminClient().rpc("reserve_nexo_model", {
      p_id: id, p_message_id: account.messageReservationId, p_tenant_id: account.tenantId ?? null,
      p_user_id: account.userId ?? null, p_requested: inputTokens + outputTokens,
    });
    if (error || !data || typeof data !== "object" || Array.isArray(data)
      || data.ok !== true || data.reservedTokens !== inputTokens + outputTokens) unavailable();
    return { id, maxTokens: outputTokens, nexo: true };
  }
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

export async function settleCredits(id: string, tokensIn: number, tokensOut: number, model: string, nexo = false) {
  if (![tokensIn, tokensOut].every(v => Number.isSafeInteger(v) && v >= 0)) unavailable();
  const { error } = await createAdminClient().rpc(nexo ? "settle_nexo_model" : "settle_credits", { p_id: id, p_tokens_in: tokensIn, p_tokens_out: tokensOut, p_model: model });
  if (error) unavailable();
}

export async function releaseCredits(id: string, nexo = false) {
  const { error } = await createAdminClient().rpc(nexo ? "release_nexo_model" : "release_credits", { p_id: id });
  if (error) unavailable();
}

function messageBalance(data: unknown): MessageBalance {
  if (!data || typeof data !== "object" || Array.isArray(data)) unavailable();
  const row = data as Record<string, unknown>;
  if (![row.quotaMessages, row.usedMessages, row.reservedMessages, row.availableMessages, row.windowHours]
    .every(value => typeof value === "number" && Number.isSafeInteger(value) && value >= 0)
    || Number(row.quotaMessages) <= 0 || row.windowHours !== 3 || typeof row.plan !== "string"
    || (row.businessName !== null && typeof row.businessName !== "string")
    || [row.resetsAt, row.fullyResetsAt].some(value => value !== null && (typeof value !== "string" || !Number.isFinite(Date.parse(value))))) unavailable();
  return data as MessageBalance;
}
export async function getMessageBalance(account: CreditAccount): Promise<MessageBalance> {
  const { data, error } = await createAdminClient().rpc("nexo_message_balance", {
    p_tenant_id: account.tenantId ?? null, p_user_id: account.userId ?? null,
  });
  if (error) unavailable();
  return messageBalance(data);
}
export async function reserveMessage(account: CreditAccount): Promise<string> {
  const id = crypto.randomUUID();
  const { data, error } = await createAdminClient().rpc("reserve_nexo_message", {
    p_id: id, p_tenant_id: account.tenantId ?? null, p_user_id: account.userId ?? null,
  });
  if (error || !data || typeof data !== "object" || Array.isArray(data)) unavailable();
  if (data.ok === false) {
    const balance = messageBalance(data.balance);
    if (data.reason === "retry_limit") {
      if (typeof data.retryAt !== "string" || !Number.isFinite(Date.parse(data.retryAt))) unavailable();
      const retry = new Date(data.retryAt).toLocaleString("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
      throw new CreditError("MESSAGES_RETRY_LIMIT", `Pausamos los reintentos repetidos de NEXO hasta ${retry} (hora de Colombia). Los mensajes fallidos no descontaron tu cupo. Tu CRM sigue disponible; revisa el error anterior antes de reintentar.`);
    }
    const next = balance.resetsAt ? new Date(balance.resetsAt).toLocaleString("es-CO", {
      timeZone: "America/Bogota", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
    }) : "dentro de unas horas";
    throw new CreditError("MESSAGES_EXHAUSTED", `Alcanzaste el límite de mensajes de NEXO. Recuperas espacio ${next} (hora de Colombia). Tu CRM sigue disponible; abrir otra conversación no cambia el cupo.`);
  }
  if (data.ok !== true) unavailable();
  return id;
}
export async function finishMessage(id: string, completed: boolean) {
  const { error } = await createAdminClient().rpc("finish_nexo_message", { p_id: id, p_completed: completed });
  if (error) unavailable();
}
