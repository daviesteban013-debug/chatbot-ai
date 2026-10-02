"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  CheckCircle,
  ChevronDown,
  ChevronRight,
  MessageSquare,
  Pencil,
  Send,
  ShoppingBag,
  Sparkles,
  X,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/dashboard/empty-state";
import { formatCOP, formatDateTime, timeAgo } from "@/lib/utils";
import { paymentMethodLabel, orderTypeLabel } from "@/lib/labels";
import {
  approveReply,
  editAndApproveReply,
  rejectReply,
  approveOrder,
  rejectOrder,
} from "./actions";
import type { Json, OrderType, PaymentMethod } from "@/lib/database.types";

// ---------- Types for data passed from the server component ----------

export type ProposedRunItem = {
  id: string;
  proposed_reply: string | null;
  created_at: string;
  mode: string;
  tool_calls: Json;
  conversation_id: string;
  customer_name: string | null;
  customer_phone: string;
  trigger_message_body: string | null;
};

export type OrderItemRow = {
  name_snapshot: string;
  qty: number;
  unit_price: number;
};

export type PendingOrderItem = {
  id: string;
  order_type: OrderType;
  total: number;
  created_at: string;
  payment_method: PaymentMethod | null;
  customer_name: string | null;
  customer_phone: string;
  shipping_city: string | null;
  shipping_department: string | null;
  shipping_address: string | null;
  recipient_name: string | null;
  items: OrderItemRow[];
};

// ---------- Tab types ----------
type TabId = "replies" | "orders";

// ---------- Main component ----------

export function ApprovalClient({
  proposedRuns,
  pendingOrders,
}: {
  proposedRuns: ProposedRunItem[];
  pendingOrders: PendingOrderItem[];
}) {
  const [activeTab, setActiveTab] = useState<TabId>("replies");
  const router = useRouter();

  return (
    <div>
      {/* Tab bar */}
      <div className="mb-6 flex items-center gap-1 border-b border-slate-200">
        <TabButton
          active={activeTab === "replies"}
          onClick={() => setActiveTab("replies")}
          icon={Sparkles}
          label="Respuestas propuestas"
          count={proposedRuns.length}
        />
        <TabButton
          active={activeTab === "orders"}
          onClick={() => setActiveTab("orders")}
          icon={ShoppingBag}
          label="Pedidos pendientes"
          count={pendingOrders.length}
        />
      </div>

      {/* Tab content */}
      {activeTab === "replies" ? (
        <RepliesList runs={proposedRuns} router={router} />
      ) : (
        <OrdersList orders={pendingOrders} router={router} />
      )}
    </div>
  );
}

// ---------- Tab button ----------

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Sparkles;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative -mb-px flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors rounded-t-lg
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/10
        ${active ? "text-slate-900" : "text-slate-500 hover:text-slate-700"}`}
    >
      <Icon className="size-4" />
      {label}
      <Badge variant={count > 0 ? "warning" : "neutral"} className="ml-0.5 text-[11px]">
        {count}
      </Badge>
      <span
        className={`absolute left-0 right-0 -bottom-px h-0.5 rounded-full transition-opacity ${
          active ? "bg-slate-900 opacity-100" : "opacity-0"
        }`}
      />
    </button>
  );
}

// ---------- Replies list ----------

function RepliesList({
  runs,
  router,
}: {
  runs: ProposedRunItem[];
  router: ReturnType<typeof useRouter>;
}) {
  if (runs.length === 0) {
    return (
      <EmptyState
        icon={Sparkles}
        title="Sin respuestas propuestas"
        description="El agente no tiene propuestas esperando aprobación. Las respuestas aparecerán aquí cuando el modo copiloto genere sugerencias."
      />
    );
  }

  return (
    <div className="grid gap-4">
      {runs.map((run) => (
        <ReplyCard key={run.id} run={run} router={router} />
      ))}
    </div>
  );
}

// ---------- Reply card ----------

function ReplyCard({
  run,
  router,
}: {
  run: ProposedRunItem;
  router: ReturnType<typeof useRouter>;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState(run.proposed_reply ?? "");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showTools, setShowTools] = useState(false);

  const toolCalls = parseToolCalls(run.tool_calls);

  function handleApprove() {
    setError(null);
    startTransition(async () => {
      const result = await approveReply(run.id);
      if (!result.ok) {
        setError(result.error ?? "Error desconocido");
        return;
      }
      router.refresh();
    });
  }

  function handleEditAndApprove() {
    setError(null);
    startTransition(async () => {
      const result = await editAndApproveReply(run.id, editedText);
      if (!result.ok) {
        setError(result.error ?? "Error desconocido");
        return;
      }
      setIsEditing(false);
      router.refresh();
    });
  }

  function handleReject() {
    setError(null);
    startTransition(async () => {
      const result = await rejectReply(run.id);
      if (!result.ok) {
        setError(result.error ?? "Error desconocido");
        return;
      }
      router.refresh();
    });
  }

  return (
    <article className="rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/40 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-slate-100 bg-slate-50/50">
        <div className="flex items-center gap-3 min-w-0">
          <MessageSquare className="size-4 text-slate-400 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-900 truncate">
              {run.customer_name ?? run.customer_phone}
            </p>
            <p className="text-xs text-slate-500">{run.customer_phone}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant="info" className="text-[11px]">
            {run.mode}
          </Badge>
          <span className="text-[11px] text-slate-400">{timeAgo(run.created_at)}</span>
        </div>
      </div>

      <div className="px-5 py-4 space-y-4">
        {/* Trigger message */}
        {run.trigger_message_body ? (
          <div className="rounded-xl bg-blue-50 border border-blue-100 px-4 py-3">
            <p className="text-[11px] font-semibold text-blue-600 uppercase tracking-wide mb-1">
              Mensaje del cliente
            </p>
            <p className="text-sm text-blue-900 leading-relaxed whitespace-pre-wrap">
              {run.trigger_message_body}
            </p>
          </div>
        ) : null}

        {/* Proposed reply or edit textarea */}
        {isEditing ? (
          <div className="space-y-3">
            <Textarea
              value={editedText}
              onChange={(e) => setEditedText(e.target.value)}
              rows={5}
              className="text-sm"
              placeholder="Escribe la respuesta editada..."
              disabled={isPending}
            />
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={handleEditAndApprove}
                disabled={isPending || !editedText.trim()}
                className="bg-emerald-600 text-white hover:bg-emerald-700"
              >
                <Send className="size-3.5" />
                {isPending ? "Enviando..." : "Enviar editado"}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setIsEditing(false);
                  setEditedText(run.proposed_reply ?? "");
                }}
                disabled={isPending}
              >
                <X className="size-3.5" />
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <div className="rounded-xl bg-slate-50 border border-slate-200/60 px-4 py-3">
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">
              Respuesta propuesta
            </p>
            <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">
              {run.proposed_reply?.trim() || "(respuesta vacía)"}
            </p>
          </div>
        )}

        {/* Tool calls (collapsible) */}
        {toolCalls.length > 0 ? (
          <div>
            <button
              type="button"
              onClick={() => setShowTools(!showTools)}
              className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors"
            >
              {showTools ? (
                <ChevronDown className="size-3.5" />
              ) : (
                <ChevronRight className="size-3.5" />
              )}
              Tools ejecutadas ({toolCalls.length})
            </button>
            {showTools ? (
              <div className="mt-2 space-y-2">
                {toolCalls.map((tc, idx) => (
                  <div
                    key={idx}
                    className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2 text-xs"
                  >
                    <p className="font-semibold text-slate-700">{tc.name}</p>
                    {tc.args ? (
                      <p className="mt-0.5 text-slate-500 break-all">
                        Args: {typeof tc.args === "string" ? tc.args : JSON.stringify(tc.args, null, 0)}
                      </p>
                    ) : null}
                    {tc.result ? (
                      <p className="mt-0.5 text-slate-500 break-all">
                        Result: {typeof tc.result === "string" ? tc.result : JSON.stringify(tc.result, null, 0)}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Error */}
        {error ? (
          <div className="flex items-start gap-2 rounded-lg bg-rose-50 border border-rose-200 px-3 py-2">
            <XCircle className="size-4 text-rose-500 mt-0.5 shrink-0" />
            <p className="text-xs text-rose-700">{error}</p>
          </div>
        ) : null}

        {/* Action buttons */}
        {!isEditing ? (
          <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
            <Button
              size="sm"
              onClick={handleApprove}
              disabled={isPending}
              className="bg-emerald-600 text-white hover:bg-emerald-700"
            >
              <CheckCircle className="size-3.5" />
              {isPending ? "Procesando..." : "Aprobar"}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setIsEditing(true)}
              disabled={isPending}
              className="border-amber-200 text-amber-700 hover:bg-amber-50"
            >
              <Pencil className="size-3.5" />
              Editar
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={handleReject}
              disabled={isPending}
            >
              <XCircle className="size-3.5" />
              Rechazar
            </Button>
            <Link
              href={`/dashboard/conversations/${run.conversation_id}`}
              className="ml-auto text-xs font-medium text-slate-500 hover:text-slate-900 transition-colors"
            >
              Ver conversación →
            </Link>
          </div>
        ) : null}
      </div>
    </article>
  );
}

// ---------- Orders list ----------

function OrdersList({
  orders,
  router,
}: {
  orders: PendingOrderItem[];
  router: ReturnType<typeof useRouter>;
}) {
  if (orders.length === 0) {
    return (
      <EmptyState
        icon={CheckCircle}
        title="Sin pedidos por aprobar"
        description="No hay pedidos en estado pendiente de aprobación."
      />
    );
  }

  return (
    <div className="grid gap-4">
      {orders.map((order) => (
        <OrderCard key={order.id} order={order} router={router} />
      ))}
    </div>
  );
}

// ---------- Order card ----------

function OrderCard({
  order,
  router,
}: {
  order: PendingOrderItem;
  router: ReturnType<typeof useRouter>;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmReject, setConfirmReject] = useState(false);

  function handleApprove() {
    setError(null);
    startTransition(async () => {
      const result = await approveOrder(order.id);
      if (!result.ok) {
        setError(result.error ?? "Error desconocido");
        return;
      }
      router.refresh();
    });
  }

  function handleReject() {
    setError(null);
    startTransition(async () => {
      const result = await rejectOrder(order.id);
      if (!result.ok) {
        setError(result.error ?? "Error desconocido");
        return;
      }
      setConfirmReject(false);
      router.refresh();
    });
  }

  return (
    <article className="rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/40 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-slate-100 bg-slate-50/50">
        <div className="flex items-center gap-3 min-w-0">
          <ShoppingBag className="size-4 text-slate-400 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-900 truncate">
              {order.customer_name ?? order.customer_phone}
            </p>
            <p className="text-xs text-slate-500">
              {orderTypeLabel[order.order_type]} · {formatDateTime(order.created_at)}
            </p>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-base font-bold text-slate-900">{formatCOP(order.total)}</p>
          <Badge variant="warning" className="text-[11px] mt-0.5">
            Pendiente de aprobación
          </Badge>
        </div>
      </div>

      <div className="px-5 py-4 space-y-4">
        {/* Items table */}
        <div className="rounded-lg border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
              <tr>
                <th className="text-left px-3 py-2 font-semibold">Producto</th>
                <th className="text-center px-3 py-2 font-semibold">Cant.</th>
                <th className="text-right px-3 py-2 font-semibold">P. unit.</th>
                <th className="text-right px-3 py-2 font-semibold">Subtotal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {order.items.map((item, idx) => (
                <tr key={idx} className="text-slate-700">
                  <td className="px-3 py-2">{item.name_snapshot}</td>
                  <td className="px-3 py-2 text-center">{item.qty}</td>
                  <td className="px-3 py-2 text-right">{formatCOP(item.unit_price)}</td>
                  <td className="px-3 py-2 text-right font-medium">
                    {formatCOP(item.unit_price * item.qty)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Shipping & payment info */}
        <div className="grid gap-3 sm:grid-cols-2 text-sm">
          {order.payment_method ? (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-0.5">
                Método de pago
              </p>
              <p className="text-slate-800">
                {paymentMethodLabel[order.payment_method]}
              </p>
            </div>
          ) : null}
          {(order.shipping_city || order.shipping_address) ? (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-0.5">
                Envío
              </p>
              <p className="text-slate-800">
                {[order.recipient_name, order.shipping_address, order.shipping_city, order.shipping_department]
                  .filter(Boolean)
                  .join(", ")}
              </p>
            </div>
          ) : null}
        </div>

        {/* Error */}
        {error ? (
          <div className="flex items-start gap-2 rounded-lg bg-rose-50 border border-rose-200 px-3 py-2">
            <XCircle className="size-4 text-rose-500 mt-0.5 shrink-0" />
            <p className="text-xs text-rose-700">{error}</p>
          </div>
        ) : null}

        {/* Action buttons */}
        <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
          <Button
            size="sm"
            onClick={handleApprove}
            disabled={isPending}
            className="bg-emerald-600 text-white hover:bg-emerald-700"
          >
            <CheckCircle className="size-3.5" />
            {isPending ? "Procesando..." : "Aprobar pedido"}
          </Button>

          {confirmReject ? (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="danger"
                onClick={handleReject}
                disabled={isPending}
              >
                Confirmar rechazo
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setConfirmReject(false)}
                disabled={isPending}
              >
                Cancelar
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              variant="danger"
              onClick={() => setConfirmReject(true)}
              disabled={isPending}
            >
              <XCircle className="size-3.5" />
              Rechazar pedido
            </Button>
          )}

          <Link
            href={`/dashboard/orders/${order.id}`}
            className="ml-auto text-xs font-medium text-slate-500 hover:text-slate-900 transition-colors"
          >
            Ver detalle →
          </Link>
        </div>
      </div>
    </article>
  );
}

// ---------- Helpers ----------

type ParsedToolCall = {
  name: string;
  args?: unknown;
  result?: unknown;
};

function parseToolCalls(raw: Json): ParsedToolCall[] {
  if (!raw || !Array.isArray(raw)) return [];
  const results: ParsedToolCall[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) continue;
    const item = entry as Record<string, unknown>;
    const fn = item.function as Record<string, unknown> | undefined;
    const name = (item.name as string) ?? (fn?.name as string) ?? "";
    if (!name) continue;
    results.push({
      name,
      args: item.arguments ?? fn?.arguments ?? null,
      result: item.result ?? item.output ?? null,
    });
  }
  return results;
}
