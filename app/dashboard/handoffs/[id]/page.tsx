import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentTenant, getCurrentUser } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/dashboard/page-header";
import { Panel, PanelHeader, PanelLink, StatusDot } from "@/components/dashboard/panel";
import {
  handoffReasonLabel,
  handoffStatusLabel,
  handoffStatusVariant,
  singleJoin,
} from "@/lib/labels";
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
    <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <PageHeader
        title={customer?.name ?? "Cliente sin nombre"}
        description={`${handoffReasonLabel[handoff.reason]} · ${customer?.phone ?? "—"}`}
        backHref="/dashboard/handoffs"
        backLabel="Handoffs"
        actions={
          <Badge variant={handoffStatusVariant[status]}>
            {handoffStatusLabel[status]}
          </Badge>
        }
      />

      <Panel className="mb-5" aria-label="Memoria y tareas del cliente">
        <PanelHeader
          title="Contexto para continuar la atención"
          actions={<PanelLink href="/dashboard/workspace">Memoria y tareas</PanelLink>}
        />
        {context.error ? <p role="alert" className="px-4 py-3 text-[13px] text-rose-700 sm:px-5">No pude cargar los recuerdos y tareas del cliente.</p>
          : !context.data?.length ? <p className="px-4 py-3 text-[13px] text-muted sm:px-5">Este cliente todavía no tiene recuerdos o tareas confirmados.</p>
          : <ul className="grid gap-2 p-4 sm:grid-cols-2 sm:p-5">{context.data.slice(0, 10).map(item => (
            <li key={item.id} className="rounded-md border border-line p-3">
              <StatusDot tone={item.kind === "memory" ? "neutral" : "warn"}>{item.kind === "memory" ? "Recuerdo confirmado" : "Tarea pendiente"}</StatusDot>
              <h3 className="mt-1.5 text-[13px] font-medium text-ink">{item.title}</h3>
              <p className="mt-0.5 whitespace-pre-wrap break-words text-[13px] leading-5 text-ink-soft">{item.body}</p>
              <p className="mt-2 text-[11px] text-muted">{item.due_at ? `Vence ${workDate(item.due_at, item.timezone)} · ${item.timezone}` : `Actualizado ${workDate(item.updated_at, "America/Bogota")}`}</p>
            </li>
          ))}</ul>}
        {(context.data?.length ?? 0) > 10 && <p className="border-t border-line px-4 py-2.5 text-xs text-muted sm:px-5">Mostrando 10 registros recientes. Consulta el resto en Memoria y tareas.</p>}
      </Panel>
      <HandoffClient
        canOperate={!user.is_anonymous && ["owner", "agent"].includes(tenantContext.role)}
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
