import { createAdminClient } from "@/lib/supabase/admin";
import { loadWhatsAppSendOptions } from "./credentials";
import { graphBaseUrl } from "./cloud";

type AdminClient = ReturnType<typeof createAdminClient>;
type FollowupStatus = "sent" | "unknown" | "failed" | "blocked";
type Claim = { id: string; tenant_id: string; lease_token: string };
type PaymentSnapshot = {
  ready: true; tenant_id: string; phone: string; order_id: string; total: number; reminder_no: number;
  payment_instructions: { link_url: string | null; transfer_instructions: string | null; version: string | null };
};
export type SalesFollowupResult = {
  claimed: number; sent: number; blocked: number; failed: number; unknown: number; skipped: number; errors: number;
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DB_TIMEOUT_MS = 3000;
const MAX_JOBS = 3;
const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));

function claims(value: unknown): Claim[] {
  if (!Array.isArray(value) || value.length > MAX_JOBS || value.some(item => !record(item)
    || typeof item.id !== "string" || !UUID.test(item.id) || typeof item.tenant_id !== "string" || !UUID.test(item.tenant_id)
    || typeof item.lease_token !== "string" || !UUID.test(item.lease_token))) throw new Error("NEXO_FOLLOWUPS_UNAVAILABLE");
  const jobs = value as Claim[];
  if (new Set(jobs.map(job => job.id)).size !== jobs.length) throw new Error("NEXO_FOLLOWUPS_UNAVAILABLE");
  return jobs;
}

function snapshot(value: unknown, tenant: string): PaymentSnapshot | null {
  if (!record(value) || value.ready !== true || value.tenant_id !== tenant || typeof value.phone !== "string"
    || !/^\+?[1-9]\d{6,14}$/.test(value.phone) || typeof value.order_id !== "string" || !UUID.test(value.order_id)
    || !Number.isSafeInteger(value.total) || Number(value.total) <= 0 || ![1, 2].includes(Number(value.reminder_no))
    || !record(value.payment_instructions)) return null;
  const payment = value.payment_instructions;
  const link = payment.link_url;
  const transfer = payment.transfer_instructions;
  if (link !== null && (typeof link !== "string" || link.length > 2048
    || !/^https:\/\/[A-Za-z0-9.-]+(?::443)?(?:[/?#][^\s]*)?$/.test(link))) return null;
  if (transfer !== null && (typeof transfer !== "string" || transfer.length > 2000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(transfer))) return null;
  if (!link && !(typeof transfer === "string" && transfer.trim())) return null;
  return value as PaymentSnapshot;
}

/** Uses only the fresh snapshot validated by SQL, never model prose or current payment settings. */
export function salesFollowupBody(value: PaymentSnapshot): string {
  const amount = `$${value.total.toLocaleString("es-CO")} COP`;
  const text = [
    `Tu pedido ${value.order_id.slice(0, 8)} por ${amount} sigue pendiente de verificación del pago.`,
    ...(value.payment_instructions.link_url ? [`Enlace de pago del negocio: ${value.payment_instructions.link_url}`] : []),
    ...(value.payment_instructions.transfer_instructions ? [`Datos para transferencia: ${value.payment_instructions.transfer_instructions}`] : []),
    `Importe: ${amount}. Referencia: ${value.order_id}.`,
    "Si ya pagaste, puedes enviar tu comprobante. Recibirlo no confirma que el pago esté verificado.",
    "Si necesitas ayuda, responde por aquí. Para dejar de recibir estos recordatorios, responde «no me escribas más».",
  ].join("\n");
  if (text.length > 4000) throw new Error("NEXO_FOLLOWUP_BODY_TOO_LONG");
  return text;
}

async function credentials(admin: AdminClient, tenant: string) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      loadWhatsAppSendOptions(admin, tenant),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("NEXO_CREDENTIALS_UNAVAILABLE")), DB_TIMEOUT_MS); }),
    ]);
  } finally { if (timer) clearTimeout(timer); }
}

/** One provider request per job. An ambiguous delivery is never retried automatically. */
export async function runSalesFollowups(admin: AdminClient): Promise<SalesFollowupResult> {
  const stats: SalesFollowupResult = { claimed: 0, sent: 0, blocked: 0, failed: 0, unknown: 0, skipped: 0, errors: 0 };
  let jobs: Claim[];
  try {
    const { data, error } = await admin.rpc("nexo_claim_sales_followups", { p_limit: MAX_JOBS }).abortSignal(AbortSignal.timeout(DB_TIMEOUT_MS));
    if (error) throw new Error();
    jobs = claims(data);
  } catch { throw new Error("NEXO_FOLLOWUPS_UNAVAILABLE"); }
  stats.claimed = jobs.length;

  for (const job of jobs) {
    async function finish(status: FollowupStatus, reason: string | null, messageId: string | null = null, body: string | null = null) {
      try {
        const { data, error } = await admin.rpc("nexo_finish_sales_followup", {
          p_id: job.id, p_lease: job.lease_token, p_status: status, p_reason: reason,
          p_wa_message_id: messageId, p_body: body,
        }).abortSignal(AbortSignal.timeout(DB_TIMEOUT_MS));
        if (error || !record(data) || data.status !== status) throw new Error();
        stats[status]++;
      } catch {
        stats.errors++;
        // SQL leaves an uncommitted delivery in sending; lease recovery must mark it unknown, never queued.
        if (status === "sent" || status === "unknown") stats.unknown++;
      }
    }

    let options: Awaited<ReturnType<typeof loadWhatsAppSendOptions>>;
    try { options = await credentials(admin, job.tenant_id); } catch { options = null; }
    if (!options) { await finish("blocked", "credentials_unavailable"); continue; }

    let fresh: unknown;
    try {
      const { data, error } = await admin.rpc("nexo_begin_sales_followup", { p_id: job.id, p_lease: job.lease_token })
        .abortSignal(AbortSignal.timeout(DB_TIMEOUT_MS));
      if (error) throw new Error();
      fresh = data;
    } catch { stats.errors++; continue; }
    if (record(fresh) && fresh.ready === false) { stats.skipped++; continue; }
    const value = snapshot(fresh, job.tenant_id);
    if (!value) { await finish("blocked", "invalid_snapshot"); continue; }
    let body: string;
    try { body = salesFollowupBody(value); } catch { await finish("blocked", "message_too_long"); continue; }

    let base: string;
    try {
      base = graphBaseUrl();
      if (!/^https:\/\/graph\.facebook\.com\/v\d{2}\.0$/.test(base) || !/^\d{5,30}$/.test(options.phoneNumberId)) throw new Error();
    } catch { await finish("blocked", "channel_not_configured"); continue; }

    let response: Response;
    try {
      response = await fetch(`${base}/${options.phoneNumberId}/messages`, {
        method: "POST", redirect: "error", signal: AbortSignal.timeout(8000),
        headers: { Authorization: `Bearer ${options.accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: value.phone,
          type: "text", text: { body } }),
      });
    } catch { await finish("unknown", "delivery_uncertain"); continue; }
    if (!response.ok) {
      await finish(response.status >= 400 && response.status < 500 ? "failed" : "unknown",
        response.status === 429 ? "rate_limited" : response.status >= 400 && response.status < 500 ? "provider_rejected" : "delivery_uncertain");
      continue;
    }
    let messageId: string | null = null;
    try {
      const result: unknown = await response.json();
      if (record(result) && Array.isArray(result.messages) && result.messages.length === 1 && record(result.messages[0])) {
        const id = result.messages[0].id;
        if (typeof id === "string" && /^wamid\.[A-Za-z0-9+/=_-]+$/.test(id) && id.length <= 300) messageId = id;
      }
    } catch { /* An accepted request without a verifiable ID is an ambiguous delivery. */ }
    if (!messageId) { await finish("unknown", "provider_response_invalid"); continue; }
    await finish("sent", null, messageId, body);
  }
  return stats;
}
