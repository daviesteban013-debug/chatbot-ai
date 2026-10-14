import { notFound, redirect } from "next/navigation";
import { Package } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { Panel, PanelHeader } from "@/components/dashboard/panel";
import {
  orderStatusLabel,
  orderStatusVariant,
  orderTypeLabel,
  paymentMethodLabel,
  paymentStatusLabel,
  paymentStatusVariant,
  singleJoin,
} from "@/lib/labels";
import { formatCOP, formatDateTime } from "@/lib/utils";
import type {
  OrderStatus,
  OrderType,
  PaymentMethod,
  PaymentStatus,
} from "@/lib/database.types";

type CustomerShape = {
  id: string;
  name: string | null;
  phone: string;
  city: string | null;
} | null;

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const tenantContext = await getCurrentTenant();
  if (!tenantContext) redirect("/login");

  const supabase = await createClient();
  const tenantId = tenantContext.tenantId;

  const { data: order } = await supabase
    .from("orders")
    .select(
      "id, status, order_type, subtotal, discount, shipping_cost, total, payment_method, payment_status, recipient_name, recipient_phone, shipping_department, shipping_city, shipping_neighborhood, shipping_address, shipping_notes, carrier, tracking_code, created_at, customers(id, name, phone, city)"
    )
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .maybeSingle();

  if (!order) notFound();

  const { data: items } = await supabase
    .from("order_items")
    .select("id, name_snapshot, qty, unit_price")
    .eq("tenant_id", tenantId)
    .eq("order_id", id);

  const customer = singleJoin(order.customers as CustomerShape);
  const lineItems = items ?? [];

  const hasShipping = Boolean(
    order.shipping_address ||
      order.shipping_city ||
      order.shipping_department ||
      order.recipient_name
  );

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <PageHeader
        title={`Pedido #${order.id.slice(0, 8)}`}
        backHref="/dashboard/orders"
        backLabel="Pedidos"
        description={
          <>
            {customer?.name ?? customer?.phone ?? "Cliente"} · Creado el{" "}
            <span className="tabular-nums">{formatDateTime(order.created_at)}</span>
          </>
        }
        actions={
          <>
            <Badge variant={orderStatusVariant[order.status as OrderStatus]}>
              {orderStatusLabel[order.status as OrderStatus]}
            </Badge>
            <Badge variant="neutral">
              {orderTypeLabel[order.order_type as OrderType]}
            </Badge>
            <Badge variant={paymentStatusVariant[order.payment_status as PaymentStatus]}>
              Pago: {paymentStatusLabel[order.payment_status as PaymentStatus]}
            </Badge>
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1.4fr_.6fr] lg:items-start">
        {/* Items */}
        <Panel aria-labelledby="order-items-title">
          <PanelHeader id="order-items-title" title="Productos" />
          {lineItems.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-left text-xs text-muted">
                    <th className="px-4 py-2 font-medium sm:px-5">Producto</th>
                    <th className="px-3 py-2 text-right font-medium">Cant.</th>
                    <th className="hidden px-3 py-2 text-right font-medium sm:table-cell">P. unit.</th>
                    <th className="px-4 py-2 text-right font-medium sm:px-5">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line border-t border-line">
                  {lineItems.map((item) => (
                    <tr key={item.id}>
                      <td className="px-4 py-2.5 font-medium text-ink sm:px-5">
                        {item.name_snapshot}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right text-ink-soft tabular-nums">
                        {item.qty}
                      </td>
                      <td className="hidden whitespace-nowrap px-3 py-2.5 text-right text-muted tabular-nums sm:table-cell">
                        {formatCOP(item.unit_price)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right font-medium text-ink tabular-nums sm:px-5">
                        {formatCOP(item.unit_price * item.qty)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-4 sm:p-5">
              <EmptyState
                icon={Package}
                title="Sin productos"
                description="Este pedido no tiene ítems registrados."
              />
            </div>
          )}

          {/* Totals */}
          <div className="space-y-1.5 border-t border-line px-4 py-3 text-[13px] sm:px-5">
            <div className="flex justify-between text-ink-soft">
              <span>Subtotal</span>
              <span className="tabular-nums">{formatCOP(order.subtotal)}</span>
            </div>
            {order.discount > 0 ? (
              <div className="flex justify-between text-emerald-700">
                <span>Descuento</span>
                <span className="tabular-nums">− {formatCOP(order.discount)}</span>
              </div>
            ) : null}
            <div className="flex justify-between text-ink-soft">
              <span>Envío</span>
              <span className="tabular-nums">{formatCOP(order.shipping_cost)}</span>
            </div>
            <div className="flex justify-between border-t border-line pt-2 text-sm font-semibold text-ink">
              <span>Total</span>
              <span className="tabular-nums">{formatCOP(order.total)}</span>
            </div>
            {order.payment_method ? (
              <p className="pt-1 text-xs text-muted">
                Método de pago:{" "}
                <span className="font-medium text-ink-soft">
                  {paymentMethodLabel[order.payment_method as PaymentMethod]}
                </span>
              </p>
            ) : null}
          </div>
        </Panel>

        {/* Shipping */}
        <aside className="space-y-5">
          <Panel aria-labelledby="order-shipping-title">
            <PanelHeader id="order-shipping-title" title="Envío" />
            {hasShipping ? (
              <dl className="divide-y divide-line text-[13px]">
                {order.recipient_name ? (
                  <Row label="Destinatario" value={order.recipient_name} />
                ) : null}
                {order.recipient_phone ? (
                  <Row label="Teléfono" value={order.recipient_phone} />
                ) : null}
                {order.shipping_address ? (
                  <Row label="Dirección" value={order.shipping_address} />
                ) : null}
                {order.shipping_neighborhood ? (
                  <Row label="Barrio" value={order.shipping_neighborhood} />
                ) : null}
                {order.shipping_city || order.shipping_department ? (
                  <Row
                    label="Ciudad"
                    value={[order.shipping_city, order.shipping_department]
                      .filter(Boolean)
                      .join(", ")}
                  />
                ) : null}
                {order.shipping_notes ? (
                  <Row label="Notas" value={order.shipping_notes} />
                ) : null}
                {order.carrier ? <Row label="Transportadora" value={order.carrier} /> : null}
                {order.tracking_code ? (
                  <Row label="Guía" value={order.tracking_code} />
                ) : null}
              </dl>
            ) : (
              <p className="px-4 py-3 text-[13px] text-muted sm:px-5">
                Sin datos de envío registrados.
              </p>
            )}
          </Panel>

          <Panel aria-labelledby="order-customer-title">
            <PanelHeader id="order-customer-title" title="Cliente" />
            <div className="px-4 py-3 sm:px-5">
              <p className="text-[13px] font-medium text-ink">
                {customer?.name ?? "Cliente sin nombre"}
              </p>
              <p className="text-xs text-muted tabular-nums">{customer?.phone}</p>
              {customer?.city ? (
                <p className="mt-0.5 text-xs text-muted">{customer.city}</p>
              ) : null}
            </div>
          </Panel>
        </aside>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 px-4 py-2.5 sm:px-5">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 break-words text-right font-medium text-ink">{value}</dd>
    </div>
  );
}
