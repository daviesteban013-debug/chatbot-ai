import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowUpRight,
  CheckCircle,
  MessageSquare,
  ShoppingBag,
  Sparkles,
  UserPlus,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant, getCurrentUser } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/dashboard/empty-state";
import { CreditBalancePanel } from "@/components/dashboard/credit-balance";
import {
  orderStatusLabel,
  orderStatusVariant,
  conversationStatusLabel,
  conversationStatusVariant,
  singleJoin,
} from "@/lib/labels";
import { formatCOP, timeAgo } from "@/lib/utils";
import type { ConversationStatus, OrderStatus } from "@/lib/database.types";

export default async function DashboardPage() {
  const [user, tenantContext] = await Promise.all([
    getCurrentUser(),
    getCurrentTenant(),
  ]);
  if (!user) redirect("/login");
  if (!tenantContext) redirect("/login");

  const supabase = await createClient();
  const tenantId = tenantContext.tenantId;

  // Métricas reales del tenant (RLS + filtro explícito por tenant_id).
  const [
    { count: totalOrders },
    { count: openConversations },
    { count: openHandoffs },
    { count: pendingApproval },
    { data: recentOrders },
    { data: recentConversations },
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
      .limit(5),
    supabase
      .from("conversations")
      .select("id, status, last_message_at, customers(id, name, phone)")
      .eq("tenant_id", tenantId)
      .order("last_message_at", { ascending: false })
      .limit(5),
  ]);

  const tenantName = tenantContext.tenant?.name ?? "tu negocio";

  const metrics = [
    {
      label: "Pedidos totales",
      value: totalOrders ?? 0,
      icon: ShoppingBag,
      href: "/dashboard/orders",
      tint: "bg-slate-950 text-white",
    },
    {
      label: "Conversaciones abiertas",
      value: openConversations ?? 0,
      icon: MessageSquare,
      href: "/dashboard/conversations",
      tint: "bg-emerald-50 text-emerald-600",
    },
    {
      label: "Handoffs abiertos",
      value: openHandoffs ?? 0,
      icon: UserPlus,
      href: "/dashboard/handoffs",
      tint: "bg-amber-50 text-amber-600",
    },
    {
      label: "Pedidos por aprobar",
      value: pendingApproval ?? 0,
      icon: CheckCircle,
      href: "/dashboard/approval",
      tint: "bg-blue-50 text-blue-600",
    },
  ];

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <header className="mb-7">
        <p className="text-xs font-medium text-slate-400">
          {new Date().toLocaleDateString("es-CO", {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
          Hola, {user.email?.split("@")[0] ?? "equipo"} 👋
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Este es el resumen en vivo de <span className="font-medium text-slate-700">{tenantName}</span>.
        </p>
      </header>

      {/* Métricas */}
      <CreditBalancePanel />
      <section className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {metrics.map(({ label, value, icon: Icon, href, tint }) => (
          <Link
            key={label}
            href={href}
            className="group rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/40 transition hover:border-slate-300 hover:shadow-md"
          >
            <div className="flex items-start justify-between gap-3">
              <span
                className={`flex size-10 items-center justify-center rounded-xl ${tint}`}
              >
                <Icon className="size-5" />
              </span>
              <ArrowUpRight className="size-4 text-slate-300 transition group-hover:text-slate-500" />
            </div>
            <p className="mt-4 text-3xl font-semibold tracking-tight text-slate-950">
              {value}
            </p>
            <p className="mt-1 text-xs text-slate-500">{label}</p>
          </Link>
        ))}
      </section>

      <section className="my-6 grid gap-6 xl:grid-cols-[1.35fr_.65fr]">
        {/* Pedidos recientes */}
        <article className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/40 sm:p-6">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-slate-950">Pedidos recientes</h2>
              <p className="mt-1 text-xs text-slate-500">
                Los últimos 5 pedidos creados
              </p>
            </div>
            <Link
              href="/dashboard/orders"
              className="text-xs font-medium text-slate-500 transition hover:text-slate-900"
            >
              Ver todos
            </Link>
          </div>
          {recentOrders && recentOrders.length > 0 ? (
            <ul className="divide-y divide-slate-100">
              {recentOrders.map((order) => {
                const customer = singleJoin(order.customers as CustomerShape);
                return (
                  <li key={order.id}>
                    <Link
                      href={`/dashboard/orders/${order.id}`}
                      className="flex items-center gap-3 py-3 transition hover:bg-slate-50/70"
                    >
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-xs font-semibold text-slate-600">
                        {(customer?.name ?? customer?.phone ?? "?")
                          .slice(0, 2)
                          .toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-slate-800">
                          {customer?.name ?? customer?.phone ?? "Cliente"}
                        </span>
                        <span className="block text-xs text-slate-500">
                          {timeAgo(order.created_at)}
                        </span>
                      </span>
                      <Badge variant={orderStatusVariant[order.status as OrderStatus]}>
                        {orderStatusLabel[order.status as OrderStatus]}
                      </Badge>
                      <span className="w-28 shrink-0 text-right text-sm font-semibold text-slate-900">
                        {formatCOP(order.total)}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState
              icon={ShoppingBag}
              title="Todavía no hay pedidos"
              description="Cuando el agente concrete ventas, aparecerán aquí en tiempo real."
            />
          )}
        </article>

        {/* Conversaciones recientes */}
        <article className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/40 sm:p-6">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-slate-950">
                <span className="inline-flex items-center gap-1.5">
                  <Sparkles className="size-4 text-yellow-500" /> Conversaciones
                </span>
              </h2>
              <p className="mt-1 text-xs text-slate-500">Actividad más reciente</p>
            </div>
          </div>
          {recentConversations && recentConversations.length > 0 ? (
            <ul className="space-y-4">
              {recentConversations.map((conversation) => {
                const customer = singleJoin(
                  conversation.customers as CustomerShape
                );
                return (
                  <li key={conversation.id} className="flex items-start gap-3">
                    <span className="mt-1.5 size-2 shrink-0 rounded-full bg-emerald-500" />
                    <Link
                      href={`/dashboard/conversations/${conversation.id}`}
                      className="min-w-0 flex-1 group"
                    >
                      <p className="truncate text-sm font-medium text-slate-800 group-hover:text-slate-950">
                        {customer?.name ?? customer?.phone ?? "Cliente"}
                      </p>
                      <p className="text-xs text-slate-500">
                        {timeAgo(conversation.last_message_at)}
                      </p>
                    </Link>
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
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState
              icon={MessageSquare}
              title="Sin conversaciones"
              description="Aún no hay chats de clientes para este negocio."
            />
          )}
          <Link
            href="/dashboard/conversations"
            className="mt-5 flex w-full items-center justify-center gap-1 border-t border-slate-100 pt-4 text-xs font-medium text-slate-600 transition hover:text-slate-950"
          >
            Ver todas <ArrowUpRight className="size-3.5" />
          </Link>
        </article>
      </section>
    </div>
  );
}

/** Forma mínima del customer que viene en el join (objeto o arreglo). */
type CustomerShape = {
  id: string;
  name: string | null;
  phone: string;
} | null;
