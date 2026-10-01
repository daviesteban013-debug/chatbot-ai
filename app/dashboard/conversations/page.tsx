import Link from "next/link";
import { redirect } from "next/navigation";
import { MessageSquare } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import {
  conversationStatusLabel,
  conversationStatusVariant,
  singleJoin,
} from "@/lib/labels";
import { timeAgo } from "@/lib/utils";
import type { ConversationStatus } from "@/lib/database.types";

type CustomerShape = { id: string; name: string | null; phone: string } | null;

export default async function ConversationsPage() {
  const tenantContext = await getCurrentTenant();
  if (!tenantContext) redirect("/login");

  const supabase = await createClient();
  const tenantId = tenantContext.tenantId;

  const { data: conversations } = await supabase
    .from("conversations")
    .select(
      "id, status, last_message_at, customers(id, name, phone), messages(id, body, type, direction, created_at)"
    )
    .eq("tenant_id", tenantId)
    .order("last_message_at", { ascending: false })
    .limit(200);

  const rows = (conversations ?? []).map((conversation) => {
    const customer = singleJoin(conversation.customers as CustomerShape);
    const messages = Array.isArray(conversation.messages)
      ? (conversation.messages as Array<{ created_at: string; body: string | null; type: string }>)
      : [];
    const last = messages
      .slice()
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0];
    return { conversation, customer, last };
  });

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <PageHeader
        title="Conversaciones"
        description="Chats de tus clientes ordenados por actividad reciente."
      />

      {rows.length > 0 ? (
        <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/40">
          <ul className="divide-y divide-slate-100">
            {rows.map(({ conversation, customer, last }) => (
              <li key={conversation.id}>
                <Link
                  href={`/dashboard/conversations/${conversation.id}`}
                  className="flex items-center gap-4 px-5 py-4 transition hover:bg-slate-50"
                >
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-sm font-semibold text-white">
                    {(customer?.name ?? customer?.phone ?? "?")
                      .replace(/\s/g, "")
                      .slice(0, 2)
                      .toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {customer?.name ?? "Cliente sin nombre"}
                      </p>
                      <span className="truncate text-xs text-slate-400">
                        {customer?.phone}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-sm text-slate-500">
                      {last?.body?.trim()
                        ? last.body
                        : last
                          ? `[${last.type}] Mensaje multimedia`
                          : "Sin mensajes todavía"}
                    </p>
                  </div>
                  <div className="hidden shrink-0 flex-col items-end gap-1.5 sm:flex">
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
                    <span className="text-[11px] text-slate-400">
                      {timeAgo(conversation.last_message_at)}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <EmptyState
          icon={MessageSquare}
          title="No hay conversaciones"
          description="Cuando un cliente escriba por WhatsApp, su chat aparecerá aquí."
        />
      )}
    </div>
  );
}
