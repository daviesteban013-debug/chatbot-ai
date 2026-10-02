import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentTenant, getCurrentUser } from "@/lib/auth";
import { singleJoin } from "@/lib/labels";
import { HandoffClient, type ThreadMessage } from "./handoff-client";
import type { HandoffStatus } from "@/lib/database.types";

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
      "id, reason, summary, priority, status, taken_by, created_at, resolved_at, conversation_id, conversations(id, status, customers(name, phone, city))"
    )
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .maybeSingle();

  if (!handoff) notFound();

  const conversation = singleJoin(
    handoff.conversations as
      | { id: string; status: string; customers: CustomerShape | CustomerShape[] }
      | Array<{ id: string; status: string; customers: CustomerShape | CustomerShape[] }>
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
