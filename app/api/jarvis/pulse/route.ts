import { NextResponse } from "next/server";
import { getCurrentTenant, getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { pulseSchema } from "@/lib/proactive";

export const dynamic = "force-dynamic";
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });

/** What is happening in the business now, for NEXO's proactive alerts. No model, no credits. */
export async function GET() {
  const [user, tenant] = await Promise.all([getCurrentUser(), getCurrentTenant()]);
  if (!user || user.is_anonymous || !tenant) return json({ error: "Inicia sesión con tu negocio." }, 401);
  try {
    const { data, error } = await createAdminClient().rpc("nexo_pulse", { p_tenant: tenant.tenantId, p_user: user.id });
    if (error || !data) return json({ error: "No pude revisar tu negocio." }, 503);
    return json({ pulse: pulseSchema.parse(data) });
  } catch { return json({ error: "No pude revisar tu negocio." }, 503); }
}
