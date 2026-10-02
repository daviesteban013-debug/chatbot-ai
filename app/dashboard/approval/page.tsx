import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant } from "@/lib/auth";
import { PageHeader } from "@/components/dashboard/page-header";
import { ApprovalClient } from "./approval-client";
import type { ProposedRunItem, PendingOrderItem, OrderItemRow } from "./approval-client";
import type { Json, OrderType, PaymentMethod } from "@/lib/database.types";
import { singleJoin } from "@/lib/labels";

type CustomerJoin = { id: string; name: string | null; phone: string } | null;
type ConversationJoin = { id: string; customer_id: string; customers: CustomerJoin | CustomerJoin[] } | null;
type TriggerMessageJoin = { id: string; body: string | null } | null;
type OrderItemSingle = { name_snapshot: string; qty: number; unit_price: number };

export default async function ApprovalPage() {
  const tenantContext = await getCurrentTenant();
  if (!tenantContext) redirect("/login");

  const supabase = await createClient();
  const tenantId = tenantContext.tenantId;

  // Query proposed agent runs with conversation + customer + trigger message
  const [{ data: runsData }, { data: ordersData }] = await Promise.all([
    supabase
      .from("agent_runs")
      .select(
        `id, proposed_reply, created_at, mode, tool_calls, conversation_id, trigger_message_id,
         conversations(id, customer_id, customers(id, name, phone))`
      )
      .eq("tenant_id", tenantId)
      .eq("status", "proposed")
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("orders")
      .select(
        `id, order_type, total, created_at, payment_method, shipping_city, shipping_department, shipping_address, recipient_name,
         customers(id, name, phone),
         order_items(name_snapshot, qty, unit_price)`
      )
      .eq("tenant_id", tenantId)
      .eq("status", "pending_approval")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  // Load trigger messages for proposed runs
  const triggerMessageIds = (runsData ?? [])
    .map((r) => r.trigger_message_id)
    .filter((id): id is string => Boolean(id));

  let triggerMessages: Array<{ id: string; body: string | null }> = [];
  if (triggerMessageIds.length > 0) {
    const { data } = await supabase
      .from("messages")
      .select("id, body")
      .in("id", triggerMessageIds);
    triggerMessages = data ?? [];
  }

  const triggerMap = new Map(triggerMessages.map((m) => [m.id, m.body]));

  // Transform proposed runs into client shape
  const proposedRuns: ProposedRunItem[] = (runsData ?? []).map((run) => {
    const conversation = singleJoin(
      run.conversations as ConversationJoin | ConversationJoin[] | null
    ) as ConversationJoin;
    const customer = conversation
      ? singleJoin(conversation.customers as CustomerJoin | CustomerJoin[])
      : null;

    return {
      id: run.id,
      proposed_reply: run.proposed_reply,
      created_at: run.created_at,
      mode: run.mode,
      tool_calls: run.tool_calls as Json,
      conversation_id: run.conversation_id,
      customer_name: customer?.name ?? null,
      customer_phone: customer?.phone ?? "",
      trigger_message_body: run.trigger_message_id
        ? triggerMap.get(run.trigger_message_id) ?? null
        : null,
    };
  });

  // Transform orders into client shape
  const pendingOrders: PendingOrderItem[] = (ordersData ?? []).map((order) => {
    const customer = singleJoin(
      order.customers as CustomerJoin | CustomerJoin[]
    );
    const rawItems = order.order_items as OrderItemSingle[] | OrderItemSingle | null | undefined;
    let items: OrderItemRow[] = [];
    if (Array.isArray(rawItems)) {
      items = rawItems.map((i) => ({
        name_snapshot: i.name_snapshot,
        qty: i.qty,
        unit_price: i.unit_price,
      }));
    } else if (rawItems && typeof rawItems === "object") {
      items = [{ name_snapshot: rawItems.name_snapshot, qty: rawItems.qty, unit_price: rawItems.unit_price }];
    }

    return {
      id: order.id,
      order_type: order.order_type as OrderType,
      total: order.total,
      created_at: order.created_at,
      payment_method: order.payment_method as PaymentMethod | null,
      customer_name: customer?.name ?? null,
      customer_phone: customer?.phone ?? "",
      shipping_city: order.shipping_city,
      shipping_department: order.shipping_department,
      shipping_address: order.shipping_address,
      recipient_name: order.recipient_name,
      items,
    };
  });

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <PageHeader
        title="Bandeja de Aprobación"
        description="Aprueba, edita o rechaza las respuestas del agente y los pedidos pendientes."
      />
      <ApprovalClient proposedRuns={proposedRuns} pendingOrders={pendingOrders} />
    </div>
  );
}
