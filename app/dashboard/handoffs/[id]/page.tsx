import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentTenant, getCurrentUser } from "@/lib/auth";
import { singleJoin } from "@/lib/labels";
import { HandoffClient, type ThreadMessage } from "./handoff-client";
import type { HandoffStatus } from "@/lib/database.types";
import { workDate } from "@/lib/workspace";

type CustomerShape = { name: string | null; phone: string; city: string | null } | null;

export default async function HandoffDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const user = await getCurrentUser();
  const tenantContext = await getCurrentTenant();
  if (!user || !tenantContext) redirect("/login");

  const supabase = await createClient();
  const tenantId = tenantContext.tenantId;

  const { data: handoff } = await supabase
    .from("handoffs")
    .select(
      "id, reason, summary, priority, status, taken_by, created_at, resolved_at, conversation_id, conversations(id, customer_id, status, customers(name, phone, city))"
    )
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .maybeSingle();

  if (!handoff) notFound();

  const conversation = singleJoin(
    handoff.conversations as
      | { id: string; customer_id: string; status: string; customers: CustomerShape | CustomerShape[] }
      | Array<{ id: string; customer_id: string; status: string; customers: CustomerShape | CustomerShape[] }>
      | null
  );
  const customer = conversation
    ? singleJoin(conversation.customers as CustomerShape)
    : null;

  const { data: messages } = await supabase
    .from("messages")
    .select("id, direction, sender, type, body, media_url, transcript, created_at")
    .eq("tenant_id", tenantId)
    .eq("conversation_id", handoff.conversation_id)
    .order("created_at", { ascending: true })
    .limit(500);

  const status = handoff.status as HandoffStatus;
  const context = conversation?.customer_id ? await supabase.from("nexo_work_items")
    .select("id,kind,title,body,due_at,timezone,updated_at").eq("tenant_id", tenantId).eq("customer_id", conversation.customer_id)
    .eq("status", "active").order("updated_at", { ascending: false }).limit(11) : { data: [], error: null };
  const isMine = status === "taken" && handoff.taken_by === user.id;

  // Resolver el nombre de quién tomó el handoff (si es otro operador).
  let takenByName: string | null = null;
  if (status === "taken" && handoff.taken_by && handoff.taken_by !== user.id) {
    takenByName = await resolveUserDisplayName(handoff.taken_by);
  }

  const thread: ThreadMessage[] = (messages ?? []).map((m) => ({
    id: m.id,
    direction: m.direction as ThreadMessage["direction"],
    sender: m.sender as ThreadMessage["sender"],
    type: m.type as ThreadMessage["type"],
    body: m.body,
    media_url: m.media_url,
    transcript: m.transcript,
    created_at: m.created_at,
  }));

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <Link
        href="/dashboard/handoffs"
        className="mb-4 inline-flex items-center gap-1 text-xs font-medium text-slate-500 transition hover:text-slate-900"
      >
        <ArrowLeft className="size-3.5" /> Handoffs
      </Link>

      <section className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-5" aria-label="Memoria y tareas del cliente">
        <div className="flex items-center justify-between gap-3"><h2 className="font-semibold text-slate-900">Contexto para continuar la atención</h2><Link className="text-xs font-medium text-amber-800 underline" href="/dashboard/workspace">Memoria y tareas</Link></div>
        {context.error ? <p role="alert" className="mt-2 text-sm text-rose-700">No pude cargar los recuerdos y tareas del cliente.</p>
          : !context.data?.length ? <p className="mt-2 text-sm text-slate-600">Este cliente todavía no tiene recuerdos o tareas confirmados.</p>
          : <ul className="mt-3 grid gap-3 sm:grid-cols-2">{context.data.slice(0, 10).map(item => <li key={item.id} className="rounded-xl bg-white/80 p-3"><p className="text-xs text-amber-800">{item.kind === "memory" ? "Recuerdo confirmado" : "Tarea pendiente"}</p><h3 className="mt-1 text-sm font-semibold">{item.title}</h3><p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-600">{item.body}</p><p className="mt-2 text-xs text-slate-500">{item.due_at ? `Vence ${workDate(item.due_at, item.timezone)} · ${item.timezone}` : `Actualizado ${workDate(item.updated_at, "America/Bogota")}`}</p></li>)}</ul>}
        {(context.data?.length ?? 0) > 10 && <p className="mt-3 text-xs text-slate-500">Mostrando 10 registros recientes. Consulta el resto en Memoria y tareas.</p>}
      </section>
      <HandoffClient
        handoffId={handoff.id}
        status={status}
        reason={handoff.reason}
        summary={handoff.summary}
        priority={handoff.priority}
        createdAt={handoff.created_at}
        resolvedAt={handoff.resolved_at}
        isMine={isMine}
        takenByName={takenByName}
        customerName={customer?.name ?? "Cliente sin nombre"}
        customerPhone={customer?.phone ?? "—"}
        customerCity={customer?.city ?? null}
        messages={thread}
      />
    </div>
  );
}

/**
 * Obtiene un nombre legible para un `user_id` de auth: prefiere el nombre del
 * perfil en `user_metadata` y cae al email. Usa el cliente service-role porque
 * leer usuarios de auth requiere privilegios elevados.
 */
async function resolveUserDisplayName(userId: string): Promise<string | null> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.getUserById(userId);
    if (error || !data?.user) return "otro operador";
    const meta = data.user.user_metadata as
      | { full_name?: string; name?: string }
      | undefined;
    return (
      meta?.full_name?.trim() ||
      meta?.name?.trim() ||
      data.user.email ||
      "otro operador"
    );
  } catch {
    return "otro operador";
  }
}
