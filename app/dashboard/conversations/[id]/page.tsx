import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { MessageSquare, Phone } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant } from "@/lib/auth";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { Panel, PanelHeader } from "@/components/dashboard/panel";
import {
  conversationStatusLabel,
  conversationStatusVariant,
  singleJoin,
} from "@/lib/labels";
import { cn, formatTime } from "@/lib/utils";
import type {
  ConversationStatus,
  MessageDirection,
  MessageSender,
} from "@/lib/database.types";
import { SalesActivity } from "@/app/dashboard/agent/sales-activity";

type CustomerShape = {
  id: string;
  name: string | null;
  phone: string;
  city: string | null;
} | null;

export default async function ConversationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const tenantContext = await getCurrentTenant();
  if (!tenantContext) redirect("/login");

  const supabase = await createClient();
  const tenantId = tenantContext.tenantId;

  const { data: conversation } = await supabase
    .from("conversations")
    .select("id, status, last_message_at, created_at, customers(id, name, phone, city)")
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .maybeSingle();

  if (!conversation) notFound();

  const { data: messages } = await supabase
    .from("messages")
    .select("id, direction, sender, type, body, media_url, transcript, created_at")
    .eq("tenant_id", tenantId)
    .eq("conversation_id", id)
    .order("created_at", { ascending: true })
    .limit(500);

  const customer = singleJoin(conversation.customers as CustomerShape);
  const thread = messages ?? [];

  const statusBadge = (
    <Badge
      variant={
        conversationStatusVariant[
          conversation.status as ConversationStatus
        ]
      }
    >
      {conversationStatusLabel[conversation.status as ConversationStatus]}
    </Badge>
  );

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <PageHeader
        title={customer?.name ?? "Cliente sin nombre"}
        description={customer?.phone}
        backHref="/dashboard/conversations"
        backLabel="Conversaciones"
        actions={statusBadge}
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        {/* Thread */}
        <Panel className="flex min-h-[60vh] flex-col overflow-hidden">
          <PanelHeader
            title="Mensajes"
            actions={
              <span className="text-xs tabular-nums text-muted">
                {thread.length} {thread.length === 1 ? "mensaje" : "mensajes"}
              </span>
            }
          />

          <div className="flex-1 space-y-2 overflow-y-auto bg-subtle/50 p-4 sm:p-5">
            {thread.length > 0 ? (
              thread.map((message) => {
                const outbound =
                  (message.direction as MessageDirection) === "outbound";
                const sender = message.sender as MessageSender;
                return (
                  <div
                    key={message.id}
                    className={cn("flex", outbound ? "justify-end" : "justify-start")}
                  >
                    <div
                      className={cn(
                        "max-w-[75%] rounded-lg px-3 py-2 text-[13px]",
                        outbound
                          ? "bg-ink text-white"
                          : "border border-line bg-surface text-ink"
                      )}
                    >
                      {message.type !== "text" && message.media_url ? (
                        <p
                          className={cn(
                            "mb-1 text-[11px] uppercase tracking-wide",
                            outbound ? "text-white/60" : "text-muted"
                          )}
                        >
                          {message.type}
                        </p>
                      ) : null}
                      {message.body?.trim() ? (
                        <p className="whitespace-pre-wrap leading-relaxed">
                          {message.body}
                        </p>
                      ) : message.transcript ? (
                        <p className="whitespace-pre-wrap leading-relaxed italic opacity-90">
                          {message.transcript}
                        </p>
                      ) : message.media_url ? null : (
                        <p className="italic opacity-70">Mensaje sin contenido</p>
                      )}
                      <p
                        className={cn(
                          "mt-1 text-[10px] tabular-nums",
                          outbound ? "text-white/60" : "text-muted"
                        )}
                      >
                        {outbound ? (sender === "human" ? "Humano · " : "Agente · ") : ""}
                        {formatTime(message.created_at)}
                      </p>
                    </div>
                  </div>
                );
              })
            ) : (
              <EmptyState
                icon={MessageSquare}
                title="Sin mensajes"
                description="Esta conversación todavía no tiene mensajes registrados."
              />
            )}
          </div>
        </Panel>

        {/* Customer info */}
        <aside className="space-y-5">
          <Panel>
            <PanelHeader title="Cliente" />
            <div className="flex items-center gap-3 px-4 py-3 sm:px-5">
              <Avatar name={customer?.name ?? customer?.phone ?? "?"} />
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium text-ink">
                  {customer?.name ?? "Cliente sin nombre"}
                </p>
                <p className="flex items-center gap-1 truncate text-xs tabular-nums text-muted">
                  <Phone className="size-3" /> {customer?.phone ?? "—"}
                </p>
              </div>
            </div>
            <dl className="divide-y divide-line border-t border-line text-[13px]">
              <div className="flex items-center justify-between gap-4 px-4 py-2.5 sm:px-5">
                <dt className="text-muted">Ciudad</dt>
                <dd className="text-right font-medium text-ink">
                  {customer?.city ?? "—"}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4 px-4 py-2.5 sm:px-5">
                <dt className="text-muted">Estado</dt>
                <dd>{statusBadge}</dd>
              </div>
            </dl>
            {customer?.id ? (
              <div className="border-t border-line px-4 py-3 sm:px-5">
                <Link
                  href={`/dashboard/orders?customer=${customer.id}`}
                  className="block w-full rounded-md border border-line px-3 py-1.5 text-center text-xs font-medium text-ink-soft transition hover:bg-subtle hover:text-ink"
                >
                  Ver pedidos del cliente
                </Link>
              </div>
            ) : null}
          </Panel>
        </aside>
      </div>
      <div className="mt-5">
        <SalesActivity tenantId={tenantId} role={tenantContext.role} conversationId={id} />
      </div>
    </div>
  );
}
