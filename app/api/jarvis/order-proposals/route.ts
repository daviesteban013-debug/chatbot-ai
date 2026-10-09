import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decisionInput, proposalSchema, proposalErrors } from "@/lib/order-proposals";

export const dynamic = "force-dynamic";
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(request: NextRequest) {
  try {
    const session = request.nextUrl.searchParams.get("sessionId");
    if (!session || !/^[a-zA-Z0-9_-]{1,160}$/.test(session)) return json({ error: "Conversación no válida." }, 400);
    const client = await createClient();
    const { data: { user } } = await client.auth.getUser();
    if (!user || user.is_anonymous) return json({ error: "Inicia sesión para revisar pedidos." }, 401);
    // RLS also requires current tenant membership and ownership of each proposal.
    const { data, error } = await client.from("nexo_order_proposals").select("*")
      .eq("user_id", user.id).eq("session_id", session).order("created_at", { ascending: false }).limit(30);
    if (error) return json({ error: "No pude actualizar las propuestas. Inténtalo de nuevo." }, 503);
    return json({ proposals: (data ?? []).map(row => proposalSchema.parse(row)) });
  } catch { return json({ error: "No pude actualizar las propuestas." }, 503); }
}

export async function POST(request: NextRequest) {
  // Decisions require a deliberate same-origin click, never a model tool call.
  if (request.headers.get("origin") !== request.nextUrl.origin || request.headers.get("sec-fetch-site") === "cross-site")
    return json({ error: "Abre NEXO para confirmar esta acción." }, 403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "Solicitud no válida." }, 400);
  try {
    const text = await request.text();
    if (text.length > 1024) return json({ error: "Solicitud demasiado grande." }, 400);
    let body: unknown;
    try { body = JSON.parse(text); } catch { return json({ error: "Solicitud no válida." }, 400); }
    const parsed = decisionInput.safeParse(body);
    if (!parsed.success) return json({ error: "Selecciona una propuesta y una acción válidas." }, 400);
    const client = await createClient();
    const { data: { user } } = await client.auth.getUser();
    if (!user || user.is_anonymous) return json({ error: "Inicia sesión para decidir sobre el pedido." }, 401);
    const { data, error } = await createAdminClient().rpc("nexo_decide_order", {
      p_id: parsed.data.id, p_user: user.id, p_decision: parsed.data.decision,
    });
    if (error) return json({ error: "No se pudo completar la acción. Revisa tus permisos y actualiza la propuesta antes de repetirla." }, 409);
    const result = data as { ok?: boolean; code?: string; proposal?: unknown } | null;
    if (!result?.ok) return json({ error: proposalErrors[result?.code ?? ""] ?? "No pude verificar el pedido. Actualiza la propuesta." }, 409);
    return json({ proposal: proposalSchema.parse(result.proposal) });
  } catch { return json({ error: "No pude verificar el resultado. Actualiza la propuesta antes de repetir la acción." }, 503); }
}
