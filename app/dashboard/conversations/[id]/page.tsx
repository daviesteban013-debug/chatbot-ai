import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, MessageSquare, Phone, User } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/dashboard/empty-state";
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

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <Link
        href="/dashboard/conversations"
        className="mb-4 inline-flex items-center gap-1 text-xs font-medium text-slate-500 transition hover:text-slate-900"
      >
        <ArrowLeft className="size-3.5" /> Conversaciones
      </Link>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        {/* Thread */}
        <section className="flex min-h-[60vh] flex-col rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/40">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold text-slate-950">
                {customer?.name ?? "Cliente sin nombre"}
              </h1>
              <p className="truncate text-xs text-slate-500">{customer?.phone}</p>
            </div>
            <Badge
              variant={
                conversationStatusVariant[
                  conversation.status as ConversationStatus
                ]
              }
            >
              {conversationStatusLabel[conversation.status as ConversationStatus]}
            </Badge>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50/60 p-5">
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
                        "max-w-[75%] rounded-2xl px-4 py-2.5 text-sm shadow-sm",
                        outbound
                          ? "rounded-br-sm bg-slate-950 text-white"
                          : "rounded-bl-sm border border-slate-200 bg-white text-slate-800"
                      )}
                    >
                      {message.type !== "text" && message.media_url ? (
                        <p
                          className={cn(
                            "mb-1 text-[11px] uppercase tracking-wide",
                            outbound ? "text-slate-400" : "text-slate-400"
                          )}
                        >
                          {message.type}
                        </p>
                      ) : null}
                      {message.body?.trim() ? (
                        <p className="whitespace-pre-wrap leading-6">
                          {message.body}
                        </p>
                      ) : message.transcript ? (
                        <p className="whitespace-pre-wrap leading-6 italic opacity-90">
                          {message.transcript}
                        </p>
                      ) : message.media_url ? null : (
                        <p className="italic opacity-70">Mensaje sin contenido</p>
                      )}
                      <p
                        className={cn(
                          "mt-1 text-[10px]",
                          outbound ? "text-slate-400" : "text-slate-400"
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
        </section>

        {/* Customer info */}
        <aside className="space-y-4">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/40">
            <h2 className="mb-4 text-sm font-semibold text-slate-900">Cliente</h2>
            <div className="flex items-center gap-3">
              <span className="flex size-12 items-center justify-center rounded-xl bg-slate-950 text-sm font-semibold text-white">
                {(customer?.name ?? customer?.phone ?? "?")
                  .replace(/\s/g, "")
                  .slice(0, 2)
                  .toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">
                  {customer?.name ?? "Cliente sin nombre"}
                </p>
                <p className="flex items-center gap-1 truncate text-xs text-slate-500">
                  <Phone className="size-3" /> {customer?.phone ?? "—"}
                </p>
              </div>
            </div>
            <dl className="mt-5 space-y-3 border-t border-slate-100 pt-4 text-sm">
              <div className="flex items-center gap-2 text-slate-600">
                <User className="size-4 text-slate-400" />
                <dt className="text-slate-500">Ciudad:</dt>
                <dd className="ml-auto font-medium text-slate-800">
                  {customer?.city ?? "—"}
                </dd>
              </div>
              <div className="flex items-center gap-2">
                <dt className="text-slate-500">Estado:</dt>
                <dd className="ml-auto">
                  <Badge
                    variant={
                      conversationStatusVariant[
                        conversation.status as ConversationStatus
                      ]
                    }
                  >
                    {conversationStatusLabel[
                      conversation.status as ConversationStatus
                    ]}
                  </Badge>
                </dd>
              </div>
            </dl>
            {customer?.id ? (
              <Link
                href={`/dashboard/orders?customer=${customer.id}`}
                className="mt-5 block w-full rounded-lg border border-slate-200 px-3 py-2 text-center text-xs font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Ver pedidos del cliente
              </Link>
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  );
}
