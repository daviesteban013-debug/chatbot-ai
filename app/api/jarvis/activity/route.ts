import { NextRequest, NextResponse } from "next/server";
import { getCurrentTenant, getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { activityItemSchema, undoErrors, undoInput } from "@/lib/activity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });

async function team() {
  const [user, tenant] = await Promise.all([getCurrentUser(), getCurrentTenant()]);
  if (!user || user.is_anonymous || !tenant) return null;
  return { user, tenant };
}

/** What Zorax did on its own in this business (owners and agents). */
export async function GET(request: NextRequest) {
  const session = await team();
  if (!session) return json({ error: "Inicia sesión con tu negocio." }, 401);
  if (session.tenant.role === "viewer") return json({ items: [] });
  const limit = Math.min(Math.max(Number(request.nextUrl.searchParams.get("limit")) || 10, 1), 30);
  try {
    const { data, error } = await createAdminClient().rpc("nexo_activity_feed", { p_tenant: session.tenant.tenantId, p_user: session.user.id, p_limit: limit });
    if (error) return json({ error: "No pude cargar lo que hizo Zorax." }, 503);
    return json({ items: activityItemSchema.array().parse(data ?? []) });
  } catch { return json({ error: "No pude cargar lo que hizo Zorax." }, 503); }
}

/** Undo requires a deliberate same-origin click; the database checks nothing changed since. */
export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin || request.headers.get("sec-fetch-site") === "cross-site")
    return json({ error: "Abre Zorax para deshacer este cambio." }, 403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "Solicitud no válida." }, 400);
  const text = await request.text();
  if (text.length > 512) return json({ error: "Solicitud demasiado grande." }, 400);
  let body: unknown;
  try { body = JSON.parse(text); } catch { return json({ error: "Solicitud no válida." }, 400); }
  const parsed = undoInput.safeParse(body);
  if (!parsed.success) return json({ error: "Selecciona una acción válida." }, 400);
  const session = await team();
  if (!session) return json({ error: "Inicia sesión para deshacer cambios." }, 401);
  if (session.tenant.role === "viewer") return json({ error: "Tu rol no permite deshacer cambios." }, 403);
  try {
    const { data, error } = await createAdminClient().rpc("nexo_undo_activity", { p_tenant: session.tenant.tenantId, p_user: session.user.id, p_log: parsed.data.log_id });
    if (error) return json({ error: error.message.includes("ACTIVITY_NOT_FOUND") ? "No encontré esa acción en tu negocio." : "No pude deshacer el cambio. Revisa tus permisos." }, 409);
    const result = data as { ok?: boolean; code?: string } | null;
    if (!result?.ok) return json({ error: undoErrors[result?.code ?? ""] ?? "No pude verificar el resultado. Actualiza antes de repetir." }, 409);
    return json({ ok: true });
  } catch { return json({ error: "No pude verificar el resultado. Actualiza antes de repetir." }, 503); }
}
