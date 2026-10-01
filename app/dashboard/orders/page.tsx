import Link from "next/link";
import { redirect } from "next/navigation";
import { ShoppingBag } from "lucide-react";
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
import {
  orderStatusLabel,
  orderStatusVariant,
  orderTypeLabel,
  paymentMethodLabel,
  singleJoin,
} from "@/lib/labels";
import { formatCOP, formatDateTime } from "@/lib/utils";
import type {
  OrderStatus,
  OrderType,
  PaymentMethod,
} from "@/lib/database.types";

type CustomerShape = { id: string; name: string | null; phone: string } | null;

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ customer?: string }>;
}) {
  const { customer: customerFilter } = await searchParams;

  const tenantContext = await getCurrentTenant();
  if (!tenantContext) redirect("/login");

  const supabase = await createClient();
  const tenantId = tenantContext.tenantId;

  let query = supabase
    .from("orders")
    .select(
      "id, status, order_type, total, payment_method, created_at, customers(id, name, phone)"
    )
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (customerFilter) {
    query = query.eq("customer_id", customerFilter);
  }

  const { data: orders } = await query;
  const rows = orders ?? [];

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <PageHeader
        title="Pedidos"
        description={
          customerFilter
            ? "Pedidos del cliente seleccionado."
            : "Todos los pedidos creados por el agente y tu equipo."
        }
        actions={
          customerFilter ? (
            <Link
              href="/dashboard/orders"
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Ver todos
            </Link>
          ) : undefined
        }
      />

      {rows.length > 0 ? (
        <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/40">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-5">Cliente</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Pago</TableHead>
                <TableHead className="pr-5">Creado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((order) => {
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
                      <span className="block text-xs text-slate-400">
                        {customer?.phone}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={orderStatusVariant[order.status as OrderStatus]}>
                        {orderStatusLabel[order.status as OrderStatus]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-slate-600">
                      {orderTypeLabel[order.order_type as OrderType]}
                    </TableCell>
                    <TableCell className="text-right font-semibold text-slate-900">
                      {formatCOP(order.total)}
                    </TableCell>
                    <TableCell className="text-slate-600">
                      {order.payment_method
                        ? paymentMethodLabel[order.payment_method as PaymentMethod]
                        : "—"}
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
          icon={ShoppingBag}
          title="No hay pedidos"
          description="Cuando el agente concrete una venta, el pedido aparecerá aquí."
        />
      )}
    </div>
  );
}
