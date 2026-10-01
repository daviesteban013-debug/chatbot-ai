import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, MapPin, Package, Truck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/dashboard/empty-state";
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
    <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <Link
        href="/dashboard/orders"
        className="mb-4 inline-flex items-center gap-1 text-xs font-medium text-slate-500 transition hover:text-slate-900"
      >
        <ArrowLeft className="size-3.5" /> Pedidos
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
            Pedido <span className="text-slate-400">#{order.id.slice(0, 8)}</span>
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {customer?.name ?? customer?.phone ?? "Cliente"} · Creado el{" "}
            {formatDateTime(order.created_at)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={orderStatusVariant[order.status as OrderStatus]}>
            {orderStatusLabel[order.status as OrderStatus]}
          </Badge>
          <Badge variant="neutral">
            {orderTypeLabel[order.order_type as OrderType]}
          </Badge>
          <Badge variant={paymentStatusVariant[order.payment_status as PaymentStatus]}>
            Pago: {paymentStatusLabel[order.payment_status as PaymentStatus]}
          </Badge>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_.6fr]">
        {/* Items */}
        <section className="rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/40">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Package className="size-4 text-slate-400" /> Productos
            </h2>
          </div>
          {lineItems.length > 0 ? (
            <ul className="divide-y divide-slate-100">
              {lineItems.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center gap-4 px-5 py-3.5"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-semibold text-slate-600">
                    {item.qty}×
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">
                    {item.name_snapshot}
                  </span>
                  <span className="shrink-0 text-sm text-slate-500">
                    {formatCOP(item.unit_price)} /u
                  </span>
                  <span className="w-28 shrink-0 text-right text-sm font-semibold text-slate-900">
                    {formatCOP(item.unit_price * item.qty)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-5">
              <EmptyState
                icon={Package}
                title="Sin productos"
                description="Este pedido no tiene ítems registrados."
              />
            </div>
          )}

          {/* Totals */}
          <div className="space-y-2 border-t border-slate-100 px-5 py-4 text-sm">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal</span>
              <span>{formatCOP(order.subtotal)}</span>
            </div>
            {order.discount > 0 ? (
              <div className="flex justify-between text-emerald-600">
                <span>Descuento</span>
                <span>− {formatCOP(order.discount)}</span>
              </div>
            ) : null}
            <div className="flex justify-between text-slate-600">
              <span>Envío</span>
              <span>{formatCOP(order.shipping_cost)}</span>
            </div>
            <div className="flex justify-between border-t border-slate-100 pt-2 text-base font-semibold text-slate-950">
              <span>Total</span>
              <span>{formatCOP(order.total)}</span>
            </div>
            {order.payment_method ? (
              <p className="pt-1 text-xs text-slate-500">
                Método de pago:{" "}
                <span className="font-medium text-slate-700">
                  {paymentMethodLabel[order.payment_method as PaymentMethod]}
                </span>
              </p>
            ) : null}
          </div>
        </section>

        {/* Shipping */}
        <aside className="space-y-4">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/40">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Truck className="size-4 text-slate-400" /> Envío
            </h2>
            {hasShipping ? (
              <dl className="space-y-3 text-sm">
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
              <p className="flex items-center gap-2 text-sm text-slate-500">
                <MapPin className="size-4 text-slate-400" />
                Sin datos de envío registrados.
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/40">
            <h2 className="mb-3 text-sm font-semibold text-slate-900">Cliente</h2>
            <p className="text-sm font-medium text-slate-800">
              {customer?.name ?? "Cliente sin nombre"}
            </p>
            <p className="text-xs text-slate-500">{customer?.phone}</p>
            {customer?.city ? (
              <p className="mt-1 text-xs text-slate-500">{customer.city}</p>
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="shrink-0 text-slate-500">{label}</dt>
      <dd className="text-right font-medium text-slate-800">{value}</dd>
    </div>
  );
}
