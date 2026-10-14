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
  X,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Panel, PanelHeader, Segmented } from "@/components/dashboard/panel";
import { formatCOP, formatDateTime, timeAgo } from "@/lib/utils";
import { agentModeLabel, paymentMethodLabel, orderTypeLabel } from "@/lib/labels";
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
  canOperate,
}: {
  proposedRuns: ProposedRunItem[];
  pendingOrders: PendingOrderItem[];
  canOperate: boolean;
}) {
  const [activeTab, setActiveTab] = useState<TabId>("replies");
  const router = useRouter();

  return (
    <div>
      {/* Tab bar */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Segmented
          label="Tipo de aprobación"
          value={activeTab}
          onChange={(value) => setActiveTab(value as TabId)}
          options={[
            { value: "replies", label: "Respuestas propuestas", count: proposedRuns.length },
            { value: "orders", label: "Pedidos pendientes", count: pendingOrders.length },
          ]}
        />
        {!canOperate && <p className="text-xs text-muted">Acceso de solo lectura. Un dueño o agente puede aprobar, editar y rechazar.</p>}
      </div>

      {/* Tab content */}
      {activeTab === "replies" ? (
        <RepliesList runs={proposedRuns} router={router} canOperate={canOperate} />
      ) : (
        <OrdersList orders={pendingOrders} router={router} canOperate={canOperate} />
      )}
    </div>
  );
}

// ---------- Replies list ----------

function RepliesList({
  runs,
  router,
  canOperate,
}: {
  runs: ProposedRunItem[];
  router: ReturnType<typeof useRouter>;
  canOperate: boolean;
}) {
  if (runs.length === 0) {
    return (
      <EmptyState
        icon={MessageSquare}
        title="Sin respuestas propuestas"
        description="No hay respuestas esperando aprobación. Aparecen aquí cuando el agente trabaja en modo copiloto."
      />
    );
  }

  return (
    <div className="grid gap-4">
      {runs.map((run) => (
        <ReplyCard key={run.id} run={run} router={router} canOperate={canOperate} />
      ))}
    </div>
  );
}

// ---------- Reply card ----------

function ReplyCard({
  run,
  router,
  canOperate,
}: {
  run: ProposedRunItem;
  router: ReturnType<typeof useRouter>;
  canOperate: boolean;
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
    <Panel as="article" className="overflow-hidden">
      {/* Header */}
      <PanelHeader
        title={run.customer_name ?? run.customer_phone}
        description={<span className="tabular-nums">{run.customer_phone}</span>}
        actions={
          <>
            <Badge variant="neutral">{modeName(run.mode)}</Badge>
            <span className="whitespace-nowrap text-[11px] text-muted">{timeAgo(run.created_at)}</span>
          </>
        }
      />

      <div className="space-y-3 px-4 py-3 sm:px-5">
        {/* Trigger message */}
        {run.trigger_message_body ? (
          <div className="border-l-2 border-line-strong pl-3">
            <p className="mb-0.5 text-[11px] font-medium text-muted">
              Mensaje del cliente
            </p>
            <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink-soft">
              {run.trigger_message_body}
            </p>
          </div>
        ) : null}

        {/* Proposed reply or edit textarea */}
        {isEditing ? (
          <div className="space-y-2">
            <Textarea
              value={editedText}
              onChange={(e) => setEditedText(e.target.value)}
              rows={5}
              className="text-[13px] leading-relaxed"
              placeholder="Escribe la respuesta editada..."
              disabled={!canOperate || isPending}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                onClick={handleEditAndApprove}
                disabled={!canOperate || isPending || !editedText.trim()}
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
                disabled={!canOperate || isPending}
              >
                <X className="size-3.5" />
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <div className="rounded-md border border-line bg-subtle px-3 py-2.5">
            <p className="mb-0.5 text-[11px] font-medium text-muted">
              Respuesta propuesta
            </p>
            <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink">
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
              aria-expanded={showTools}
              className="flex items-center gap-1 text-xs font-medium text-muted transition-colors hover:text-ink"
            >
              {showTools ? (
                <ChevronDown className="size-3.5" />
              ) : (
                <ChevronRight className="size-3.5" />
              )}
              Herramientas usadas <span className="tabular-nums">({toolCalls.length})</span>
            </button>
            {showTools ? (
              <ul className="mt-2 divide-y divide-line rounded-md border border-line text-xs">
                {toolCalls.map((tc, idx) => (
                  <li key={idx} className="px-3 py-2">
                    <p className="font-mono font-medium text-ink-soft">{tc.name}</p>
                    {tc.args ? (
                      <p className="mt-0.5 break-all font-mono text-[11px] text-muted">
                        Argumentos: {typeof tc.args === "string" ? tc.args : JSON.stringify(tc.args, null, 0)}
                      </p>
                    ) : null}
                    {tc.result ? (
                      <p className="mt-0.5 break-all font-mono text-[11px] text-muted">
                        Resultado: {typeof tc.result === "string" ? tc.result : JSON.stringify(tc.result, null, 0)}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        {/* Error */}
        {error ? <ErrorNote message={error} /> : null}
      </div>

      {/* Action buttons */}
      {!isEditing ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3 sm:px-5">
          <Button
            size="sm"
            onClick={handleApprove}
            disabled={!canOperate || isPending}
          >
            <CheckCircle className="size-3.5" />
            {isPending ? "Procesando..." : "Aprobar"}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setIsEditing(true)}
            disabled={!canOperate || isPending}
          >
            <Pencil className="size-3.5" />
            Editar
          </Button>
          <Button
            size="sm"
            variant="danger"
            onClick={handleReject}
            disabled={!canOperate || isPending}
          >
            <XCircle className="size-3.5" />
            Rechazar
          </Button>
          <Link
            href={`/dashboard/conversations/${run.conversation_id}`}
            className="ml-auto text-xs font-medium text-muted transition-colors hover:text-ink"
          >
            Ver conversación
          </Link>
        </div>
      ) : null}
    </Panel>
  );
}

// ---------- Orders list ----------

function OrdersList({
  orders,
  router,
  canOperate,
}: {
  orders: PendingOrderItem[];
  router: ReturnType<typeof useRouter>;
  canOperate: boolean;
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
        <OrderCard key={order.id} order={order} router={router} canOperate={canOperate} />
      ))}
    </div>
  );
}

// ---------- Order card ----------

function OrderCard({
  order,
  router,
  canOperate,
}: {
  order: PendingOrderItem;
  router: ReturnType<typeof useRouter>;
  canOperate: boolean;
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

  const hasDetails = Boolean(order.payment_method || order.shipping_city || order.shipping_address);

  return (
    <Panel as="article" className="overflow-hidden">
      {/* Header */}
      <PanelHeader
        title={order.customer_name ?? order.customer_phone}
        description={
          <>
            {orderTypeLabel[order.order_type]} · <span className="tabular-nums">{formatDateTime(order.created_at)}</span>
          </>
        }
        actions={
          <>
            <Badge variant="warning">Pendiente de aprobación</Badge>
            <span className="text-sm font-semibold text-ink tabular-nums">{formatCOP(order.total)}</span>
          </>
        }
      />

      {/* Items table */}
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
            {order.items.map((item, idx) => (
              <tr key={idx}>
                <td className="px-4 py-2 text-ink sm:px-5">{item.name_snapshot}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right text-ink-soft tabular-nums">{item.qty}</td>
                <td className="hidden whitespace-nowrap px-3 py-2 text-right text-muted tabular-nums sm:table-cell">{formatCOP(item.unit_price)}</td>
                <td className="whitespace-nowrap px-4 py-2 text-right font-medium text-ink tabular-nums sm:px-5">
                  {formatCOP(item.unit_price * item.qty)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Shipping & payment info */}
      {hasDetails ? (
        <div className="grid gap-3 border-t border-line px-4 py-3 text-[13px] sm:grid-cols-2 sm:px-5">
          {order.payment_method ? (
            <div>
              <p className="mb-0.5 text-[11px] font-medium text-muted">
                Método de pago
              </p>
              <p className="text-ink">
                {paymentMethodLabel[order.payment_method]}
              </p>
            </div>
          ) : null}
          {(order.shipping_city || order.shipping_address) ? (
            <div>
              <p className="mb-0.5 text-[11px] font-medium text-muted">
                Envío
              </p>
              <p className="text-ink">
                {[order.recipient_name, order.shipping_address, order.shipping_city, order.shipping_department]
                  .filter(Boolean)
                  .join(", ")}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Error + action buttons */}
      <div className="space-y-3 border-t border-line px-4 py-3 sm:px-5">
        {error ? <ErrorNote message={error} /> : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            onClick={handleApprove}
            disabled={!canOperate || isPending}
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
                disabled={!canOperate || isPending}
              >
                Confirmar rechazo
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setConfirmReject(false)}
                disabled={!canOperate || isPending}
              >
                Cancelar
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              variant="danger"
              onClick={() => setConfirmReject(true)}
              disabled={!canOperate || isPending}
            >
              <XCircle className="size-3.5" />
              Rechazar pedido
            </Button>
          )}

          <Link
            href={`/dashboard/orders/${order.id}`}
            className="ml-auto text-xs font-medium text-muted transition-colors hover:text-ink"
          >
            Ver detalle
          </Link>
        </div>
      </div>
    </Panel>
  );
}

// ---------- Helpers ----------

/** Short Spanish name of the agent mode ("Copiloto" instead of "copilot"). */
function modeName(mode: string) {
  const label = agentModeLabel[mode];
  return label ? label.split(" (")[0] : mode;
}

function ErrorNote({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2">
      <XCircle className="mt-0.5 size-3.5 shrink-0 text-rose-600" />
      <p className="text-xs text-rose-800">{message}</p>
    </div>
  );
}

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
