import Link from "next/link";
import { redirect } from "next/navigation";
import { MessageSquare } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant } from "@/lib/auth";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { Panel } from "@/components/dashboard/panel";
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
    // Only the latest message per chat: imported WhatsApp Business chats can hold months of history.
    .order("created_at", { referencedTable: "messages", ascending: false })
    .limit(1, { referencedTable: "messages" })
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
    <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <PageHeader
        title="Conversaciones"
        description="Chats de tus clientes ordenados por actividad reciente."
      />

      {rows.length > 0 ? (
        <Panel className="overflow-hidden">
          <div className="hidden items-center gap-3 border-b border-line px-4 py-2 text-xs font-medium text-muted sm:flex sm:px-5">
            <span className="flex-1 pl-11">Cliente y último mensaje</span>
            <span className="w-28 shrink-0">Estado</span>
            <span className="w-28 shrink-0 text-right">Actividad</span>
          </div>
          <ul className="divide-y divide-line">
            {rows.map(({ conversation, customer, last }) => (
              <li key={conversation.id}>
                <Link
                  href={`/dashboard/conversations/${conversation.id}`}
                  className="flex items-center gap-3 px-4 py-2.5 transition hover:bg-subtle/60 sm:px-5"
                >
                  <Avatar
                    name={customer?.name ?? customer?.phone ?? "?"}
                    className="size-8 text-xs"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <p className="truncate text-[13px] font-medium text-ink">
                        {customer?.name ?? "Cliente sin nombre"}
                      </p>
                      <span className="hidden truncate text-[11px] tabular-nums text-muted sm:inline">
                        {customer?.phone}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-[13px] text-muted">
                      {last?.body?.trim()
                        ? last.body
                        : last
                          ? `[${last.type}] Mensaje multimedia`
                          : "Sin mensajes todavía"}
                    </p>
                  </div>
                  <span className="hidden w-28 shrink-0 sm:block">
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
                  </span>
                  <span className="shrink-0 whitespace-nowrap text-right text-[11px] text-muted sm:w-28">
                    {timeAgo(conversation.last_message_at)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
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
