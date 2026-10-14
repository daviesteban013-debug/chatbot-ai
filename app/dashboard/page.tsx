import Link from "next/link";
import { redirect } from "next/navigation";
import { MessageSquare, ShoppingBag } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant, getCurrentUser } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/dashboard/empty-state";
import { CreditBalancePanel } from "@/components/dashboard/credit-balance";
import { SalesResults } from "@/components/dashboard/sales-results";
import { Panel, PanelHeader, PanelLink, Stat, StatGrid, StatusDot } from "@/components/dashboard/panel";
import { HomeActivity } from "@/components/dashboard/home-activity";
import { createAdminClient } from "@/lib/supabase/admin";
import { metricPeriod, type SalesMetrics } from "@/lib/sales-metrics";
import { buildBriefing, type BriefingData } from "@/lib/briefing";
import {
  orderStatusLabel,
  orderStatusVariant,
  conversationStatusLabel,
  conversationStatusVariant,
  singleJoin,
} from "@/lib/labels";
import { formatCOP, timeAgo } from "@/lib/utils";
import type { ConversationStatus, OrderStatus } from "@/lib/database.types";

/** Greeting and date in Colombia time, independent of the server's timezone. */
function today() {
  const now = new Date();
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Bogota", hour: "numeric", hourCycle: "h23" }).format(now));
  return {
    greeting: hour < 12 ? "Buenos días" : hour < 19 ? "Buenas tardes" : "Buenas noches",
    date: now.toLocaleDateString("es-CO", { timeZone: "America/Bogota", weekday: "long", day: "numeric", month: "long" }),
  };
}

const TONE = { good: "good", warning: "warn", info: "neutral" } as const;

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const period = metricPeriod((await searchParams).periodo);
  const [user, tenantContext] = await Promise.all([
    getCurrentUser(),
    getCurrentTenant(),
  ]);
  if (!user) redirect("/login");
  if (!tenantContext) redirect("/login");

  const supabase = await createClient();
  const admin = createAdminClient();
  const tenantId = tenantContext.tenantId;

  // Métricas reales del tenant (RLS + filtro explícito por tenant_id).
  const [
    { count: totalOrders },
    { count: openConversations },
    { count: openHandoffs },
    { count: pendingApproval },
    { data: recentOrders },
    { data: recentConversations },
    { data: results },
    { data: briefingData },
  ] = await Promise.all([
    supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId),
    supabase
      .from("conversations")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("status", "open"),
    supabase
      .from("handoffs")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("status", "open"),
    supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("status", "pending_approval"),
    supabase
      .from("orders")
      .select(
        "id, status, total, created_at, customers(id, name, phone)"
      )
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(6),
    supabase
      .from("conversations")
      .select("id, status, last_message_at, customers(id, name, phone)")
      .eq("tenant_id", tenantId)
      .order("last_message_at", { ascending: false })
      .limit(5),
    // Results and the daily briefing are computed in the database for any member (viewers included).
    admin.rpc("nexo_sales_metrics", { p_tenant: tenantId, p_user: user.id, p_days: period }),
    admin.rpc("nexo_daily_briefing", { p_tenant: tenantId, p_user: user.id }),
  ]);

  const tenantName = tenantContext.tenant?.name ?? "tu negocio";
  const { greeting, date } = today();
  const name = user.email?.split("@")[0] ?? "";
  // "Ayer vendiste…" links to this same page; the rest point to where the work is.
  const attention = briefingData ? buildBriefing(briefingData as unknown as BriefingData).items.map(item => item.action?.href === "/dashboard" ? { ...item, action: undefined } : item) : [];

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b border-line pb-5">
        <div>
          <p className="text-xs text-muted first-letter:uppercase">{date}</p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-ink">{greeting}{name ? `, ${name}` : ""}</h1>
          <p className="mt-1 text-sm text-muted">Resumen de <span className="font-medium text-ink-soft">{tenantName}</span></p>
        </div>
      </header>

      <div className="mb-5 grid gap-5 xl:grid-cols-[1.25fr_.75fr]">
        <Panel aria-labelledby="today-title">
          <PanelHeader id="today-title" title="Para hoy" description="Lo que necesita tu atención, con datos del CRM en hora de Colombia" />
          {attention.length ? (
            <ul className="divide-y divide-line">
              {attention.map(item => (
                <li key={item.id} className="flex items-center justify-between gap-3 px-4 py-2.5 sm:px-5">
                  <StatusDot tone={TONE[item.tone]}><span className="text-[13px] text-ink">{item.text}</span></StatusDot>
                  {item.action ? (
                    <Link href={item.action.href} className="shrink-0 rounded-md border border-line px-2 py-1 text-xs font-medium text-ink-soft transition hover:bg-subtle hover:text-ink">
                      {item.action.label}
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-6 text-sm text-muted sm:px-5">No pude preparar el resumen de hoy. Los contadores de al lado siguen al día.</p>
          )}
        </Panel>
        <StatGrid className="grid-cols-2 self-start">
          <Stat label="Conversaciones abiertas" value={openConversations ?? 0} href="/dashboard/conversations" />
          <Stat label="Esperan un asesor" value={openHandoffs ?? 0} href="/dashboard/handoffs" />
          <Stat label="Pedidos por aprobar" value={pendingApproval ?? 0} href="/dashboard/approval" />
          <Stat label="Pedidos totales" value={totalOrders ?? 0} href="/dashboard/orders" />
        </StatGrid>
      </div>

      {results ? <SalesResults metrics={results as unknown as SalesMetrics} /> : null}

      <div className="grid gap-5 xl:grid-cols-[1.25fr_.75fr] xl:items-start">
        <Panel aria-labelledby="orders-title">
          <PanelHeader id="orders-title" title="Pedidos recientes" description="Los últimos 6 pedidos" actions={<PanelLink href="/dashboard/orders">Ver todos</PanelLink>} />
          {recentOrders && recentOrders.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-left text-xs text-muted">
                    <th className="px-4 py-2 font-medium sm:px-5">Cliente</th>
                    <th className="px-3 py-2 font-medium">Estado</th>
                    <th className="hidden px-3 py-2 font-medium sm:table-cell">Creado</th>
                    <th className="px-4 py-2 text-right font-medium sm:px-5">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line border-t border-line">
                  {recentOrders.map((order) => {
                    const customer = singleJoin(order.customers as CustomerShape);
                    return (
                      <tr key={order.id} className="transition hover:bg-subtle/60">
                        <td className="max-w-[14rem] px-4 py-2.5 sm:px-5">
                          <Link href={`/dashboard/orders/${order.id}`} className="block truncate font-medium text-ink hover:underline">
                            {customer?.name ?? customer?.phone ?? "Cliente"}
                          </Link>
                        </td>
                        <td className="px-3 py-2.5">
                          <Badge variant={orderStatusVariant[order.status as OrderStatus]}>
                            {orderStatusLabel[order.status as OrderStatus]}
                          </Badge>
                        </td>
                        <td className="hidden whitespace-nowrap px-3 py-2.5 text-muted sm:table-cell">{timeAgo(order.created_at)}</td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-right font-medium tabular-nums text-ink sm:px-5">{formatCOP(order.total)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-4 sm:p-5">
              <EmptyState
                icon={ShoppingBag}
                title="Todavía no hay pedidos"
                description="Cuando NEXO cierre ventas por WhatsApp, aparecerán aquí."
              />
            </div>
          )}
        </Panel>

        <div className="space-y-5">
          <HomeActivity canConfigure={tenantContext.role === "owner"} enabled={tenantContext.role !== "viewer"} />

          <Panel aria-labelledby="conversations-title">
            <PanelHeader id="conversations-title" title="Conversaciones" description="Actividad más reciente" actions={<PanelLink href="/dashboard/conversations">Ver todas</PanelLink>} />
            {recentConversations && recentConversations.length > 0 ? (
              <ul className="divide-y divide-line">
                {recentConversations.map((conversation) => {
                  const customer = singleJoin(conversation.customers as CustomerShape);
                  return (
                    <li key={conversation.id}>
                      <Link href={`/dashboard/conversations/${conversation.id}`} className="flex items-center gap-3 px-4 py-2.5 transition hover:bg-subtle/60 sm:px-5">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium text-ink">{customer?.name ?? customer?.phone ?? "Cliente"}</span>
                          <span className="block text-[11px] text-muted">{timeAgo(conversation.last_message_at)}</span>
                        </span>
                        <Badge variant={conversationStatusVariant[conversation.status as ConversationStatus]}>
                          {conversationStatusLabel[conversation.status as ConversationStatus]}
                        </Badge>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="p-4 sm:p-5">
                <EmptyState icon={MessageSquare} title="Sin conversaciones" description="Aún no hay chats de clientes para este negocio." />
              </div>
            )}
          </Panel>

          <CreditBalancePanel />
        </div>
      </div>
    </div>
  );
}

/** Forma mínima del customer que viene en el join (objeto o arreglo). */
type CustomerShape = {
  id: string;
  name: string | null;
  phone: string;
} | null;
