import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { jobView, type JobRow } from "@/lib/jobs/types";
import { MAX_IMPORT_PRODUCTS, type DraftProduct } from "@/lib/catalog/drafts";
import type { Json } from "@/lib/database.types";
import { jobsTeam as team } from "@/lib/jobs/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("cancel") }).strict(),
  z.object({ action: z.literal("apply"), mode: z.enum(["merge", "only_new"]).optional(), selected: z.array(z.number().int().min(0).max(MAX_IMPORT_PRODUCTS)).max(MAX_IMPORT_PRODUCTS).optional() }).strict(),
]);
const IMPORT_ERRORS: Record<string, string> = {
  catalog_forbidden: "Tu rol no permite editar el catálogo.",
  catalog_invalid: "Los productos del trabajo ya no son válidos. Pídele a NEXO que lea el archivo de nuevo.",
};
/** In an import, an empty field means "not in the file": it must not erase stored data. */
const present = <T extends object>(value: T) => Object.fromEntries(Object.entries(value).filter(([, v]) => v !== null && v !== undefined));

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!UUID.test(id)) return json({ error: "Trabajo no válido." }, 400);
  const session = await team();
  if (!session) return json({ error: "Inicia sesión con tu negocio." }, 401);
  if (session.tenant.role === "viewer") return json({ error: "Tu rol no permite ver los trabajos." }, 403);
  try {
    const { data, error } = await createAdminClient().from("nexo_jobs").select("*").eq("id", id).eq("tenant_id", session.tenant.tenantId).maybeSingle();
    if (error) return json({ error: "No pude cargar el trabajo." }, 503);
    if (!data) return json({ error: "No encontré ese trabajo en tu negocio." }, 404);
    const row = data as JobRow;
    return json({ job: jobView(row), result: row.status === "done" ? row.result : null });
  } catch { return json({ error: "No pude cargar el trabajo." }, 503); }
}

/** Cancel, or apply the drafts an import left for review (a deliberate same-origin click). */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (request.headers.get("origin") !== request.nextUrl.origin || request.headers.get("sec-fetch-site") === "cross-site")
    return json({ error: "Abre NEXO para gestionar este trabajo." }, 403);
  const { id } = await context.params;
  if (!UUID.test(id)) return json({ error: "Trabajo no válido." }, 400);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "Solicitud no válida." }, 400);
  const text = await request.text();
  if (text.length > 8192) return json({ error: "Solicitud demasiado grande." }, 413);
  let body: unknown;
  try { body = JSON.parse(text); } catch { return json({ error: "Solicitud no válida." }, 400); }
  const parsed = action.safeParse(body);
  if (!parsed.success) return json({ error: "Acción no válida." }, 400);
  const session = await team();
  if (!session) return json({ error: "Inicia sesión con tu negocio." }, 401);
  if (session.tenant.role === "viewer") return json({ error: "Tu rol no permite gestionar trabajos." }, 403);
  const admin = createAdminClient();
  const args = { p_tenant: session.tenant.tenantId, p_user: session.user.id, p_id: id };
  try {
    if (parsed.data.action === "cancel") {
      const { data, error } = await admin.rpc("nexo_cancel_job", args);
      if (error) return json({ error: error.message.includes("JOB_NOT_FOUND") ? "No encontré ese trabajo en tu negocio." : "No pude cancelar el trabajo." }, error.message.includes("JOB_NOT_FOUND") ? 404 : 409);
      return json({ job: jobView(data as JobRow) });
    }
    const { data: row, error } = await admin.from("nexo_jobs").select("*").eq("id", id).eq("tenant_id", session.tenant.tenantId).maybeSingle();
    if (error) return json({ error: "No pude cargar el trabajo." }, 503);
    if (!row) return json({ error: "No encontré ese trabajo en tu negocio." }, 404);
    const job = row as JobRow;
    const result = job.result && typeof job.result === "object" && !Array.isArray(job.result) ? job.result as Record<string, Json | undefined> : {};
    if (job.kind !== "catalog_import" || job.status !== "done") return json({ error: "Este trabajo no deja productos para aplicar." }, 409);
    if (job.applied_at) return json({ error: "Estos productos ya se importaron." }, 409);
    const drafts = Array.isArray(result.drafts) ? result.drafts as unknown as DraftProduct[] : [];
    const indexes = parsed.data.selected ?? drafts.map((_, index) => index);
    const chosen = [...new Set(indexes)].filter(index => drafts[index]).map(index => ({ index, draft: drafts[index] }));
    const ready = chosen.filter(({ draft }) => typeof draft.price_retail === "number");
    if (!ready.length) return json({ error: chosen.length ? "Ningún producto seleccionado tiene precio. Revísalos en Trabajos antes de importar." : "Selecciona al menos un producto." }, 400);
    const products = ready.map(({ draft }) => ({
      ...present({ sku: draft.sku, name: draft.name, description: draft.description, category: draft.category, price_retail: draft.price_retail,
        price_wholesale: draft.price_wholesale, wholesale_min_qty: draft.wholesale_min_qty, image_url: draft.image_url }),
      variants: (draft.variants ?? []).map(variant => present({ sku: variant.sku, color: variant.color, size: variant.size, stock_qty: variant.stock_qty, price_override: variant.price_override })),
    }));
    const mode = parsed.data.mode ?? (result.mode === "only_new" ? "only_new" : "merge");
    const { data: imported, error: importError } = await admin.rpc("nexo_import_products", { p_tenant: session.tenant.tenantId, p_user: session.user.id, p_products: products as Json, p_mode: mode });
    if (importError) {
      const code = Object.keys(IMPORT_ERRORS).find(key => importError.message.includes(key));
      return json({ error: code ? IMPORT_ERRORS[code] : "No se pudo importar. Inténtalo de nuevo." }, 409);
    }
    const summary = imported as { created: number; updated: number; skipped: number; results: { index: number; status: string; reason?: string }[] };
    const outcome = {
      mode, created: summary.created, updated: summary.updated, skipped: summary.skipped + (chosen.length - ready.length), missing_price: chosen.length - ready.length,
      results: summary.results.slice(0, MAX_IMPORT_PRODUCTS).map(item => ({ ...item, index: ready[item.index]?.index ?? item.index })),
    };
    const { data: marked, error: markError } = await admin.rpc("nexo_mark_job_applied", { ...args, p_outcome: outcome });
    if (markError) return json({ error: "Los productos se importaron, pero no pude anotarlo en el trabajo. Revisa el catálogo antes de repetir." }, 409);
    return json({ job: jobView(marked as JobRow), applied: outcome });
  } catch { return json({ error: "No pude completar la acción. Actualiza antes de repetir." }, 503); }
}
