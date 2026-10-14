import { NextResponse } from "next/server";
import { getCurrentTenant, getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });

/** Facts for the daily briefing, computed in the database for any member of the business. */
export async function GET() {
  const [user, tenant] = await Promise.all([getCurrentUser(), getCurrentTenant()]);
  if (!user || user.is_anonymous || !tenant) return json({ error: "Inicia sesión con tu negocio." }, 401);
  try {
    const { data, error } = await createAdminClient().rpc("nexo_daily_briefing", { p_tenant: tenant.tenantId, p_user: user.id });
    if (error || !data) return json({ error: "No pude preparar tu resumen del día." }, 503);
    return json({ briefing: data });
  } catch { return json({ error: "No pude preparar tu resumen del día." }, 503); }
}
