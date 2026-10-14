import Link from "next/link";
import { redirect } from "next/navigation";
import { ShoppingBag } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { Panel } from "@/components/dashboard/panel";
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
    <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
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
              className="inline-flex h-8 items-center rounded-md border border-line bg-surface px-3 text-[13px] font-medium text-ink transition-colors hover:bg-subtle"
            >
              Ver todos
            </Link>
          ) : undefined
        }
      />

      {rows.length > 0 ? (
        <Panel className="overflow-hidden">
          <Table className="text-[13px]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4 sm:pl-5">Cliente</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="hidden sm:table-cell">Tipo</TableHead>
                <TableHead className="hidden md:table-cell">Pago</TableHead>
                <TableHead className="hidden sm:table-cell">Creado</TableHead>
                <TableHead className="pr-4 text-right sm:pr-5">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((order) => {
                const customer = singleJoin(order.customers as CustomerShape);
                return (
                  <TableRow key={order.id}>
                    <TableCell className="max-w-[16rem] pl-4 sm:pl-5">
                      <Link
                        href={`/dashboard/orders/${order.id}`}
                        className="block truncate font-medium text-ink hover:underline"
                      >
                        {customer?.name ?? customer?.phone ?? "Cliente"}
                      </Link>
                      <span className="block text-[11px] text-muted tabular-nums">
                        {customer?.phone}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={orderStatusVariant[order.status as OrderStatus]}>
                        {orderStatusLabel[order.status as OrderStatus]}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {orderTypeLabel[order.order_type as OrderType]}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {order.payment_method
                        ? paymentMethodLabel[order.payment_method as PaymentMethod]
                        : <span className="text-muted">—</span>}
                    </TableCell>
                    <TableCell className="hidden whitespace-nowrap text-muted tabular-nums sm:table-cell">
                      {formatDateTime(order.created_at)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap pr-4 text-right font-medium text-ink tabular-nums sm:pr-5">
                      {formatCOP(order.total)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Panel>
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
