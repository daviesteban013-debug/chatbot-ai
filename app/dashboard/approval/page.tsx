import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle, Info, ShoppingBag, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { orderTypeLabel, singleJoin } from "@/lib/labels";
import { formatCOP, formatDateTime, timeAgo } from "@/lib/utils";
import type { OrderType } from "@/lib/database.types";

type CustomerShape = { id: string; name: string | null; phone: string } | null;

export default async function ApprovalPage() {
  const tenantContext = await getCurrentTenant();
  if (!tenantContext) redirect("/login");

  const supabase = await createClient();
  const tenantId = tenantContext.tenantId;

  const [{ data: pendingOrders }, { data: proposedRuns }] = await Promise.all([
    supabase
      .from("orders")
      .select(
        "id, order_type, total, created_at, customers(id, name, phone)"
      )
      .eq("tenant_id", tenantId)
      .eq("status", "pending_approval")
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("agent_runs")
      .select("id, mode, proposed_reply, created_at, conversation_id")
      .eq("tenant_id", tenantId)
      .eq("status", "proposed")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const orders = pendingOrders ?? [];
  const runs = proposedRuns ?? [];

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <PageHeader
        title="Bandeja de Aprobación"
        description="Pedidos y respuestas que esperan tu visto bueno."
      />

      <div className="mb-6 flex items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4">
        <Info className="mt-0.5 size-5 shrink-0 text-blue-600" />
        <div>
          <p className="text-sm font-semibold text-blue-900">
            Disponible en modo copilot — Fase 4
          </p>
          <p className="mt-0.5 text-sm text-blue-700">
            Por ahora esta bandeja es informativa. La aprobación y edición de
            respuestas y pedidos se habilitará en una próxima fase.
          </p>
        </div>
      </div>

      {/* Pending orders */}
      <section className="mb-8">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
          <ShoppingBag className="size-4 text-slate-400" /> Pedidos pendientes de
          aprobación
          <Badge variant="warning" className="ml-1">
            {orders.length}
          </Badge>
        </h2>
        {orders.length > 0 ? (
          <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/40">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-5">Cliente</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="pr-5">Creado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order) => {
                  const customer = singleJoin(order.customers as CustomerShape);
                  return (
                    <TableRow key={order.id} className="group">
                      <TableCell className="pl-5">
                        <Link
                          href={`/dashboard/orders/${order.id}`}
                          className="font-medium text-slate-900 transition group-hover:text-blue-700"
                        >
                          {customer?.name ?? customer?.phone ?? "Cliente"}
                        </Link>
                      </TableCell>
                      <TableCell className="text-slate-600">
                        {orderTypeLabel[order.order_type as OrderType]}
                      </TableCell>
                      <TableCell className="text-right font-semibold text-slate-900">
                        {formatCOP(order.total)}
                      </TableCell>
                      <TableCell className="pr-5 text-slate-500">
                        {formatDateTime(order.created_at)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        ) : (
          <EmptyState
            icon={CheckCircle}
            title="Sin pedidos por aprobar"
            description="No hay pedidos en estado pendiente de aprobación."
          />
        )}
      </section>

      {/* Proposed runs */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
          <Sparkles className="size-4 text-yellow-500" /> Respuestas propuestas
          <Badge variant="info" className="ml-1">
            {runs.length}
          </Badge>
        </h2>
        {runs.length > 0 ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {runs.map((run) => (
              <article
                key={run.id}
                className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/40"
              >
                <div className="mb-3 flex items-center justify-between gap-2">
                  <Badge variant="info">Modo {run.mode}</Badge>
                  <span className="text-[11px] text-slate-400">
                    {timeAgo(run.created_at)}
                  </span>
                </div>
                <p className="whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-sm leading-6 text-slate-700">
                  {run.proposed_reply?.trim() || "Respuesta vacía."}
                </p>
                {run.conversation_id ? (
                  <Link
                    href={`/dashboard/conversations/${run.conversation_id}`}
                    className="mt-3 inline-block text-xs font-medium text-slate-500 transition hover:text-slate-900"
                  >
                    Ver conversación →
                  </Link>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Sparkles}
            title="Sin respuestas propuestas"
            description="El agente no tiene propuestas esperando aprobación."
          />
        )}
      </section>
    </div>
  );
}
