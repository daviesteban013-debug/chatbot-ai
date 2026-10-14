import { NextResponse } from "next/server";
import { getCurrentTenant, getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });

/** Last 7 days against the 7 before, for NEXO's weekly routine. */
export async function GET() {
  const [user, tenant] = await Promise.all([getCurrentUser(), getCurrentTenant()]);
  if (!user || user.is_anonymous || !tenant) return json({ error: "Inicia sesión con tu negocio." }, 401);
  try {
    const { data, error } = await createAdminClient().rpc("nexo_sales_metrics", { p_tenant: tenant.tenantId, p_user: user.id, p_days: 7 });
    if (error || !data) return json({ error: "No pude preparar el cierre de la semana." }, 503);
    return json({ metrics: data });
  } catch { return json({ error: "No pude preparar el cierre de la semana." }, 503); }
}
