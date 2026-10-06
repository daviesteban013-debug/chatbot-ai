import { NextResponse } from "next/server";
import { getCurrentTenant, getCurrentUser } from "@/lib/auth";
import { getCreditBalance } from "@/lib/credits/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Inicia sesión para consultar tu saldo." }, { status: 401 });
  try {
    const tenant = await getCurrentTenant();
    const balance = await getCreditBalance({ tenantId: tenant?.tenantId, userId: user.id, channel: "web" });
    return NextResponse.json({ balance }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Tu saldo no está disponible. Inténtalo más tarde." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
