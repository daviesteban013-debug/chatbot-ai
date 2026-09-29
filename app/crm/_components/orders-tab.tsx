import { Clock, Package } from "lucide-react";
import type { Order } from "@/lib/types";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const MONTHS_ES = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
];

/** 9.8 -> "$9.80" */
export function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

/** "2026-09-29T09:15:00" -> "29 sep 2026, 9:15 AM" (sin desfase de zona horaria) */
function formatDateTime(iso: string): string {
  const [datePart, timePart] = iso.split("T");
  const [year, month, day] = (datePart ?? "").split("-").map(Number);
  if (!year || !month || !day) return iso;
  const dateLabel = `${String(day).padStart(2, "0")} ${MONTHS_ES[month - 1]} ${year}`;

  const [hoursStr, minutesStr] = (timePart ?? "00:00:00").split(":");
  const hours = Number(hoursStr);
  if (Number.isNaN(hours)) return dateLabel;
  const period = hours >= 12 ? "PM" : "AM";
  const hours12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${dateLabel}, ${hours12}:${minutesStr ?? "00"} ${period}`;
}

const STATUS_CONFIG: Record<
  Order["status"],
  { label: string; variant: "success" | "warning" | "danger" | "info" }
> = {
  pending: { label: "Pendiente", variant: "warning" },
  paid: { label: "Pagado", variant: "info" },
  delivered: { label: "Entregado", variant: "success" },
  canceled: { label: "Cancelado", variant: "danger" },
};

const STATUS_ORDER: Record<Order["status"], number> = {
  pending: 0,
  paid: 1,
  delivered: 2,
  canceled: 3,
};

/** Pendientes primero; dentro del mismo estado, más recientes arriba. */
function sortOrders(items: Order[]): Order[] {
  return [...items].sort((a, b) => {
    const byStatus = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    if (byStatus !== 0) return byStatus;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

function OrderCard({ order }: { order: Order }) {
  const status = STATUS_CONFIG[order.status];
  const isPending = order.status === "pending";

  return (
    <Card
      className={cn(
        "p-4 sm:p-5 transition-colors",
        isPending && "border-amber-300 bg-amber-50/40",
        order.status === "canceled" && "opacity-70"
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Avatar name={order.clientName} />
          <div className="min-w-0">
            <p className="font-medium text-slate-900 truncate">
              {order.clientName}
            </p>
            <p className="text-xs text-slate-500 truncate">
              {order.clientPhone}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-lg font-semibold text-slate-900 tabular-nums">
            {formatCurrency(order.total)}
          </p>
          <Badge variant={status.variant}>{status.label}</Badge>
        </div>
      </div>

      <ul className="mt-4 divide-y divide-slate-100 rounded-lg bg-white/70 border border-slate-100">
        {order.items.map((item) => (
          <li
            key={`${order.id}-${item.name}`}
            className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
          >
            <span className="flex items-center gap-2 min-w-0 text-slate-700">
              <Package
                className="h-3.5 w-3.5 shrink-0 text-slate-400"
                aria-hidden="true"
              />
              <span className="truncate">{item.name}</span>
              <span className="shrink-0 text-xs text-slate-500">
                x{item.quantity}
              </span>
            </span>
            <span className="shrink-0 text-slate-500 tabular-nums">
              {formatCurrency(item.price * item.quantity)}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex items-center gap-1.5 text-xs text-slate-500">
        <Clock className="h-3.5 w-3.5" aria-hidden="true" />
        <time dateTime={order.createdAt}>{formatDateTime(order.createdAt)}</time>
        {isPending && (
          <span className="ml-auto font-medium text-amber-700">
            Requiere atención
          </span>
        )}
      </div>
    </Card>
  );
}

export function OrdersTab({ orders }: { orders: Order[] }) {
  const sorted = sortOrders(orders);

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {sorted.map((order) => (
        <OrderCard key={order.id} order={order} />
      ))}
    </div>
  );
}
