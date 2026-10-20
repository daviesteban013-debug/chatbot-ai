import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { jobOptions, jobView, startJobInput, type JobRow } from "@/lib/jobs/types";
import { jobsTeam, startErrors } from "@/lib/jobs/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
const startBody = startJobInput.extend({ session_id: z.string().min(1).max(200), request_key: z.string().uuid().optional() }).strict();

/** Jobs of this business (owners and agents); ?mine=1 keeps only the caller's, ?status=active the unfinished ones. */
export async function GET(request: NextRequest) {
  const session = await jobsTeam();
  if (!session) return json({ error: "Inicia sesión con tu negocio." }, 401);
  if (session.tenant.role === "viewer") return json({ jobs: [] });
  const params = request.nextUrl.searchParams;
  const limit = Math.min(Math.max(Number(params.get("limit")) || 20, 1), 50);
  try {
    let query = createAdminClient().from("nexo_jobs").select("*").eq("tenant_id", session.tenant.tenantId).order("created_at", { ascending: false }).limit(limit);
    if (params.get("mine") === "1") query = query.eq("user_id", session.user.id);
    if (params.get("status") === "active") query = query.in("status", ["queued", "running"]);
    const { data, error } = await query;
    if (error) return json({ error: "No pude cargar los trabajos." }, 503);
    return json({ jobs: (data as JobRow[]).map(jobView) });
  } catch { return json({ error: "No pude cargar los trabajos." }, 503); }
}

/** Starts a job from the interface (quick actions, watched folder, "review collections now"). */
export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin || request.headers.get("sec-fetch-site") === "cross-site")
    return json({ error: "Inicia los trabajos desde Zorax." }, 403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "Solicitud no válida." }, 400);
  const text = await request.text();
  if (text.length > 4096) return json({ error: "Solicitud demasiado grande." }, 413);
  let body: unknown;
  try { body = JSON.parse(text); } catch { return json({ error: "Solicitud no válida." }, 400); }
  const parsed = startBody.safeParse(body);
  if (!parsed.success) return json({ error: "Indica qué trabajo iniciar y con qué archivos." }, 400);
  const options = jobOptions[parsed.data.kind].safeParse(parsed.data.options ?? {});
  if (!options.success) return json({ error: "Las opciones del trabajo no son válidas." }, 400);
  const session = await jobsTeam();
  if (!session) return json({ error: "Inicia sesión con tu negocio." }, 401);
  if (session.tenant.role === "viewer") return json({ error: "Tu rol no permite iniciar trabajos." }, 403);
  try {
    const admin = createAdminClient();
    // From the CRM (no chat open) jobs live in one private session per person: "jobs".
    const sessionId = parsed.data.session_id === "jobs" ? `jobs:${session.user.id}` : parsed.data.session_id;
    const { data: owned } = await admin.from("jarvis_sessions").select("session_id").eq("session_id", sessionId)
      .eq("user_id", session.user.id).eq("tenant_id", session.tenant.tenantId).maybeSingle();
    if (!owned && parsed.data.session_id === "jobs") {
      const { error: createError } = await admin.from("jarvis_sessions").insert({ session_id: sessionId, user_id: session.user.id, tenant_id: session.tenant.tenantId, title: "Trabajos en segundo plano" });
      if (createError && createError.code !== "23505") return json({ error: "No pude preparar tus trabajos. Inténtalo de nuevo." }, 503);
    } else if (!owned) return json({ error: "Esta conversación no es tuya. Abre Zorax de nuevo." }, 403);
    const { data, error } = await admin.rpc("nexo_start_job", {
      p_tenant: session.tenant.tenantId, p_user: session.user.id, p_session: sessionId, p_kind: parsed.data.kind,
      p_input: { file_ids: parsed.data.file_ids, ...(parsed.data.note ? { note: parsed.data.note } : {}), options: options.data },
      p_key: `ui:${parsed.data.request_key ?? crypto.randomUUID()}`,
    });
    if (error) {
      const code = Object.keys(startErrors).find(key => error.message.includes(key));
      const [status, message] = code ? startErrors[code] : [503, "No pude iniciar el trabajo. Inténtalo de nuevo."];
      return json({ error: message }, status);
    }
    const { existing, ...row } = data as JobRow & { existing?: boolean };
    return json({ job: jobView(row), existing: existing === true }, existing ? 200 : 201);
  } catch { return json({ error: "No pude iniciar el trabajo. Inténtalo de nuevo." }, 503); }
}
