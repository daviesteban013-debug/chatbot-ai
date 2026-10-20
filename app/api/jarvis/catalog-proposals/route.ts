import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { FILE_BUCKET } from "@/lib/files/types";
import { catalogDecisionInput, catalogProposalErrors, catalogProposalSchema } from "@/lib/catalog-proposals";
import { storeProductPhoto, toProductJpeg } from "@/lib/catalog/photos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(request: NextRequest) {
  try {
    const session = request.nextUrl.searchParams.get("sessionId");
    if (!session || !/^[a-zA-Z0-9_-]{1,160}$/.test(session)) return json({ error: "Conversación no válida." }, 400);
    const client = await createClient();
    const { data: { user } } = await client.auth.getUser();
    if (!user || user.is_anonymous) return json({ error: "Inicia sesión para revisar cambios del catálogo." }, 401);
    // RLS also requires current owner/agent membership and ownership of each proposal.
    const { data, error } = await client.from("nexo_catalog_proposals").select("*")
      .eq("user_id", user.id).eq("session_id", session).order("created_at", { ascending: false }).limit(30);
    if (error) return json({ error: "No pude actualizar los cambios del catálogo." }, 503);
    // Changes Zorax applied alone carry their activity entry so the card can offer Undo.
    const automatic = (data ?? []).filter(row => row.applied_by_nexo).map(row => row.id);
    const activity = new Map<string, { id: string; status: "applied" | "undone"; undoable: boolean }>();
    if (automatic.length) {
      const { data: logs } = await client.from("nexo_activity_log").select("id,ref_id,status,created_at")
        .eq("kind", "catalog").in("ref_id", automatic);
      for (const log of logs ?? []) activity.set(log.ref_id, { id: log.id, status: log.status,
        undoable: log.status === "applied" && Date.parse(log.created_at) > Date.now() - 7 * 86400000 });
    }
    return json({ proposals: (data ?? []).map(row => catalogProposalSchema.parse({ ...row, activity: activity.get(row.id) ?? null })) });
  } catch { return json({ error: "No pude actualizar los cambios del catálogo." }, 503); }
}

/** Decisions require a deliberate same-origin click, never a model tool call. */
export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin || request.headers.get("sec-fetch-site") === "cross-site")
    return json({ error: "Abre Zorax para confirmar este cambio." }, 403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "Solicitud no válida." }, 400);
  try {
    const text = await request.text();
    if (text.length > 1024) return json({ error: "Solicitud demasiado grande." }, 400);
    let body: unknown;
    try { body = JSON.parse(text); } catch { return json({ error: "Solicitud no válida." }, 400); }
    const parsed = catalogDecisionInput.safeParse(body);
    if (!parsed.success) return json({ error: "Selecciona un cambio y una acción válidos." }, 400);
    const client = await createClient();
    const { data: { user } } = await client.auth.getUser();
    if (!user || user.is_anonymous) return json({ error: "Inicia sesión para decidir sobre el cambio." }, 401);
    const admin = createAdminClient();

    // A new product with a photo attached in the chat: copy it to the public product bucket first.
    let imageUrl: string | null = null;
    if (parsed.data.decision === "confirm") {
      const { data: row } = await admin.from("nexo_catalog_proposals").select("tenant_id,status,snapshot")
        .eq("id", parsed.data.id).eq("user_id", user.id).maybeSingle();
      const attachment = (row?.snapshot as { attachment_id?: string } | null)?.attachment_id;
      if (row?.status === "pending" && attachment) {
        const { data: file } = await admin.from("jarvis_files").select("object_path").eq("id", attachment).eq("user_id", user.id).maybeSingle();
        const download = file ? await admin.storage.from(FILE_BUCKET).download(file.object_path) : null;
        if (!download?.data) return json({ error: "No pude leer la foto adjunta. Vuelve a adjuntarla y pide el producto de nuevo." }, 409);
        try { imageUrl = await storeProductPhoto(row.tenant_id, await toProductJpeg(new Uint8Array(await download.data.arrayBuffer()))); }
        catch { return json({ error: "No pude preparar la foto del producto. No se creó el producto." }, 409); }
      }
    }

    const { data, error } = await admin.rpc("nexo_decide_catalog_change", {
      p_id: parsed.data.id, p_user: user.id, p_decision: parsed.data.decision, p_image_url: imageUrl,
    });
    if (error) return json({ error: "No se pudo aplicar el cambio. Revisa tus permisos y actualiza la propuesta." }, 409);
    const result = data as { ok?: boolean; code?: string; proposal?: unknown } | null;
    if (!result?.ok) return json({ error: catalogProposalErrors[result?.code ?? ""] ?? "No pude verificar el cambio. Actualiza la propuesta." }, 409);
    return json({ proposal: catalogProposalSchema.parse(result.proposal) });
  } catch { return json({ error: "No pude verificar el resultado. Actualiza la propuesta antes de repetir la acción." }, 503); }
}
