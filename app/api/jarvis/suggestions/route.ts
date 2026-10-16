import { NextRequest, NextResponse } from "next/server";
import { getCurrentTenant, getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { suggestionDecision, suggestionSchema } from "@/lib/suggestions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });

async function owner() {
  const [user, tenant] = await Promise.all([getCurrentUser(), getCurrentTenant()]);
  if (!user || user.is_anonymous || !tenant) return null;
  return { user, tenant };
}

/** Automation the owner might turn on, based on what the team keeps confirming by hand. */
export async function GET() {
  const session = await owner();
  if (!session) return json({ error: "Inicia sesión con tu negocio." }, 401);
  if (session.tenant.role !== "owner") return json({ suggestions: [] });
  try {
    const { data, error } = await createAdminClient().rpc("nexo_automation_suggestions", { p_tenant: session.tenant.tenantId, p_user: session.user.id });
    if (error) return json({ error: "No pude revisar las sugerencias." }, 503);
    return json({ suggestions: suggestionSchema.array().parse(data ?? []) });
  } catch { return json({ error: "No pude revisar las sugerencias." }, 503); }
}

/** "Activar" turns one switch on; "Ahora no" hides the suggestion for 30 days. Owner, same origin. */
export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin || request.headers.get("sec-fetch-site") === "cross-site")
    return json({ error: "Abre NEXO para decidir esto." }, 403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "Solicitud no válida." }, 400);
  const text = await request.text();
  if (text.length > 512) return json({ error: "Solicitud demasiado grande." }, 400);
  let body: unknown;
  try { body = JSON.parse(text); } catch { return json({ error: "Solicitud no válida." }, 400); }
  const parsed = suggestionDecision.safeParse(body);
  if (!parsed.success) return json({ error: "Selecciona una sugerencia válida." }, 400);
  const session = await owner();
  if (!session) return json({ error: "Inicia sesión con tu negocio." }, 401);
  if (session.tenant.role !== "owner") return json({ error: "Solo el dueño del negocio decide la autonomía de NEXO." }, 403);
  const args = { p_tenant: session.tenant.tenantId, p_user: session.user.id };
  try {
    const admin = createAdminClient();
    const { error } = parsed.data.action === "enable"
      ? await admin.rpc("nexo_configure_autonomy", { ...args, p_settings: { [parsed.data.key]: true } })
      : await admin.rpc("nexo_dismiss_suggestion", { ...args, p_key: parsed.data.key });
    if (error) return json({ error: "No pude guardar tu decisión. Comprueba que sigas siendo el dueño del negocio." }, 409);
    return json({ ok: true, key: parsed.data.key, action: parsed.data.action });
  } catch { return json({ error: "No pude guardar tu decisión. Inténtalo de nuevo." }, 503); }
}
