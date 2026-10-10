import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant } from "@/lib/auth";

export const dynamic = "force-dynamic";
export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  try {
    const client = await createClient();
    const { data: { user } } = await client.auth.getUser();
    const tenant = user && !user.is_anonymous ? await getCurrentTenant() : null;
    if (!user || !tenant) return NextResponse.json({ error: "Inicia sesión." }, { status: 401, headers });
    const { count, error } = await client.from("nexo_work_items").select("id", { count: "exact", head: true })
      .eq("tenant_id", tenant.tenantId).eq("kind", "task").eq("status", "active").lte("due_at", new Date().toISOString())
      .or(`assignee_id.eq.${user.id},and(assignee_id.is.null,created_by.eq.${user.id})`);
    if (error || count === null) return NextResponse.json({ error: "No pude consultar los vencimientos." }, { status: 503, headers });
    return NextResponse.json({ overdue: count }, { headers });
  } catch { return NextResponse.json({ error: "No pude consultar los vencimientos." }, { status: 503, headers }); }
}
