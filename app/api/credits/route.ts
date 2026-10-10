import { NextResponse } from "next/server";
import { getCurrentTenant, getCurrentUser } from "@/lib/auth";
import { getCreditBalance, getMessageBalance } from "@/lib/credits/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Inicia sesión para consultar tu saldo." }, { status: 401 });
  try {
    const tenant = await getCurrentTenant();
    const account = { tenantId: tenant?.tenantId, userId: user.id, channel: "web" as const };
    const balance = await getMessageBalance(account);
    const whatsappBalance = tenant ? await getCreditBalance({ ...account, channel: "whatsapp" }) : null;
    return NextResponse.json({ balance, whatsappBalance }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Tu saldo no está disponible. Inténtalo más tarde." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
