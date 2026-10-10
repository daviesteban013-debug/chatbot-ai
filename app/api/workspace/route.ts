import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentTenant } from "@/lib/auth";
import { workInput, workDecision } from "@/lib/workspace";

export const dynamic = "force-dynamic";
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "no-store" } });
class BodyInputError extends Error { constructor(public status: number) { super("Solicitud no válida o demasiado grande."); } }
async function readInput(request: NextRequest): Promise<unknown> {
  const declared = request.headers.get("content-length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > 32768)) throw new BodyInputError(413);
  if (!request.body) throw new BodyInputError(400);
  const reader = request.body.getReader(), decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0, text = "";
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 32768) { await reader.cancel().catch(() => {}); throw new BodyInputError(413); }
      text += decoder.decode(chunk.value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } catch (error) { throw error instanceof BodyInputError ? error : new BodyInputError(400); }
  finally { reader.releaseLock(); }
}
async function context() {
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  const tenant = user && !user.is_anonymous ? await getCurrentTenant() : null;
  return user && tenant ? { client, user, tenant } : null;
}
export async function GET(request: NextRequest) {
  try {
    const ctx = await context();
    if (!ctx) return json({ error: "Inicia sesión con un negocio." }, 401);
    const tab = request.nextUrl.searchParams.get("tab") ?? "task";
    if (!["task", "memory", "proposed", "history"].includes(tab)) return json({ error: "Vista no válida." }, 400);
    const page = Math.floor(Math.min(100, Math.max(0, Number(request.nextUrl.searchParams.get("page")) || 0)));
    let query = ctx.client.from("nexo_work_items").select("*", { count: "exact" }).eq("tenant_id", ctx.tenant.tenantId);
    if (tab === "proposed") query = query.eq("status", "proposed").eq("created_by", ctx.user.id).gt("expires_at", new Date().toISOString());
    else if (tab === "history") query = query.in("status", ["done", "canceled"]);
    else query = query.eq("kind", tab as "task" | "memory").eq("status", "active");
    const results = await Promise.all([
      query.order(tab === "task" ? "due_at" : "updated_at", { ascending: tab === "task" }).order("id").range(page * 30, page * 30 + 29),
      ctx.client.from("customers").select("id,name,phone").eq("tenant_id", ctx.tenant.tenantId).order("name").limit(100),
      createAdminClient().from("tenant_members").select("user_id,role").eq("tenant_id", ctx.tenant.tenantId).limit(100),
      ctx.client.from("nexo_task_reminders").select("id,item_id,due_at,created_at").eq("tenant_id", ctx.tenant.tenantId).eq("user_id", ctx.user.id).order("created_at", { ascending: false }).limit(50),
    ]);
    if (results.some(result => result.error)) return json({ error: "No pude cargar memoria y tareas. Inténtalo de nuevo." }, 503);
    return json({ items: results[0].data, total: results[0].count, customers: results[1].data, members: results[2].data, reminders: results[3].data,
      userId: ctx.user.id, canWrite: ctx.tenant.role !== "viewer", tenantName: ctx.tenant.tenant?.name ?? "Tu negocio" });
  } catch { return json({ error: "No pude cargar memoria y tareas." }, 503); }
}
async function mutate(request: NextRequest, decision: boolean) {
  if (request.headers.get("origin") !== request.nextUrl.origin || request.headers.get("sec-fetch-site") === "cross-site") return json({ error: "Abre el CRM para guardar esta acción." }, 403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "Solicitud no válida." }, 400);
  try {
    const ctx = await context();
    if (!ctx) return json({ error: "Inicia sesión con un negocio." }, 401);
    if (ctx.tenant.role === "viewer") return json({ error: "Tu rol permite consultar; pide a un agente o dueño que guarde los cambios." }, 403);
    const value = await readInput(request);
    const admin = createAdminClient();
    if (decision) {
      const parsed = workDecision.safeParse(value);
      if (!parsed.success) return json({ error: "Comprueba la acción y los cambios." }, 400);
      const { data, error } = await admin.rpc("nexo_change_work", { p_tenant: ctx.tenant.tenantId, p_user: ctx.user.id, p_id: parsed.data.id, p_revision: parsed.data.revision, p_action: parsed.data.action, p_patch: parsed.data.patch ?? {} });
      if (error) return json({ error: "No se guardó el cambio: comprueba permisos, fecha y si la propuesta venció o cambió. Actualiza antes de repetir." }, 409);
      return json({ item: data });
    }
    const parsed = z.object({ requestKey: z.string().uuid(), input: workInput }).strict().safeParse(value);
    if (!parsed.success) return json({ error: "Comprueba título, cliente y fecha futura con zona horaria." }, 400);
    const { data, error } = await admin.rpc("nexo_propose_work", { p_tenant: ctx.tenant.tenantId, p_user: ctx.user.id, p_session: null, p_key: parsed.data.requestKey, p_input: parsed.data.input });
    if (error) return json({ error: "No pude preparar la propuesta. Comprueba permisos, cliente, responsable y fecha." }, 409);
    return json({ item: data });
  } catch (error) {
    if (error instanceof BodyInputError) return json({ error: error.message }, error.status);
    return json({ error: "No pude verificar el resultado. Actualiza antes de repetir la acción." }, 503);
  }
}
export async function POST(request: NextRequest) { return mutate(request, false); }
export async function PATCH(request: NextRequest) { return mutate(request, true); }
