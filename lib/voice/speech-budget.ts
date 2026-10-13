import { getCurrentTenant } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export type VoiceOutcome = "completed" | "failed" | "unknown";
export type SpeechReservation =
  | { ok: true; finish: (outcome: VoiceOutcome) => Promise<void> }
  | { ok: false; status: 429 | 503; error: string; retryAfterSeconds?: number };

/** PostgreSQL serializes reservations across tabs, users and serverless instances. */
export async function reserveSpeechBudget(userId: string, units: number, channel: "tts" | "stt"): Promise<SpeechReservation> {
  const unavailable = (): SpeechReservation => ({ ok: false, status: 503, error: "No se pudo comprobar el cupo de voz. Inténtalo de nuevo; puedes continuar por texto." });
  try {
    const tenant = await getCurrentTenant();
    const admin = createAdminClient();
    const id = crypto.randomUUID();
    const { data, error } = await admin.rpc("nexo_reserve_voice", {
      p_id: id, p_user: userId, p_tenant: tenant?.tenantId ?? null, p_channel: channel, p_units: units,
    }).abortSignal(AbortSignal.timeout(3000));
    if (error || !data || typeof data !== "object" || Array.isArray(data)) return unavailable();
    if (data.ok === false && ["quota", "busy", "rate"].includes(String(data.reason))) {
      const retry = data.retryAfterSeconds;
      if (typeof retry !== "number" || !Number.isInteger(retry) || retry < 1 || retry > 600) return unavailable();
      const label = channel === "tts" ? "voz" : "escucha";
      return { ok: false, status: 429, retryAfterSeconds: retry, error: data.reason === "quota"
        ? `Se alcanzó el cupo temporal de ${label}${tenant ? " de este negocio" : " de tu cuenta"}. Se recupera en ${Math.ceil(retry / 60)} min; puedes seguir por texto.`
        : `Espera ${retry} s antes de pedir más ${label}. Puedes continuar por texto.` };
    }
    if (data.ok !== true || data.requestId !== id) return unavailable();
    let finished = false;
    return { ok: true, async finish(outcome) {
      if (finished) return;
      finished = true;
      try {
        await admin.rpc("nexo_finish_voice", { p_id: id, p_user: userId, p_outcome: outcome })
          .abortSignal(AbortSignal.timeout(3000));
      } catch { /* Lease expiry releases concurrency without refunding potentially billed work. */ }
    } };
  } catch { return unavailable(); }
}
