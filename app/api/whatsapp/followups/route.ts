import { createAdminClient } from "@/lib/supabase/admin";
import { runSalesFollowups } from "@/lib/whatsapp/sales-followups";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;
const MAX_BODY_BYTES = 256;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

/** One-time, short-lived server ticket; browser sessions cannot start outbound workers. */
export async function POST(request: Request) {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") return json({ error: "Formato no válido." }, 415);
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > MAX_BODY_BYTES)) return json({ error: "Solicitud demasiado grande." }, 413);
  let payload: unknown;
  const reader = request.body?.getReader();
  if (!reader) return json({ error: "Datos no válidos." }, 400);
  try {
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) { await reader.cancel(); return json({ error: "Solicitud demasiado grande." }, 413); }
      chunks.push(value);
    }
    payload = JSON.parse(new TextDecoder().decode(Buffer.concat(chunks)));
  } catch { return json({ error: "Datos no válidos." }, 400); }
  finally { reader.releaseLock(); }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)
    || Object.keys(payload).length !== 1 || !("token" in payload) || typeof payload.token !== "string" || !UUID.test(payload.token)) return json({ error: "Datos no válidos." }, 400);
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("nexo_consume_sales_worker_ticket", { p_token: payload.token })
      .abortSignal(AbortSignal.timeout(3000));
    if (error) return json({ error: "Seguimiento temporalmente no disponible." }, 503);
    if (data !== true) return json({ error: "Acceso no autorizado." }, 401);
    return json({ ok: true, ...await runSalesFollowups(admin) });
  } catch { return json({ error: "Seguimiento temporalmente no disponible." }, 503); }
}
