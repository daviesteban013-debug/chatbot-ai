import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { load } from "./load.mjs";

const { executeOperatorReadTool } = await import(await load("../../lib/agent/operator.ts", { zod: import.meta.resolve("zod") }));
const tenant = "tenant-a", otherTenant = "tenant-b";
const customer = "11111111-1111-4111-8111-111111111111";
const foreignCustomer = "22222222-2222-4222-8222-222222222222";
const order = "33333333-3333-4333-8333-333333333333";
const foreignOrder = "44444444-4444-4444-8444-444444444444";
const conversation = "55555555-5555-4555-8555-555555555555";
const foreignConversation = "66666666-6666-4666-8666-666666666666";
let tables, queries, failure, missingCount;

beforeEach(() => {
  queries = []; failure = null; missingCount = false;
  tables = {
    customers: [
      { id: customer, tenant_id: tenant, name: "Ana", notes: "x".repeat(2500) },
      { id: foreignCustomer, tenant_id: otherTenant, name: "Privado", notes: "private" },
    ],
    orders: [
      { id: order, tenant_id: tenant, customer_id: customer, total: 200, created_at: "2026-10-09", order_type: "retail" },
      { id: foreignOrder, tenant_id: otherTenant, customer_id: foreignCustomer, total: 999, created_at: "2026-10-08" },
      { id: "older-order", tenant_id: tenant, customer_id: customer, total: 100, created_at: "2026-10-07" },
    ],
    order_items: [
      { id: "item-a", tenant_id: tenant, order_id: order, variant_id: "variant-a", name_snapshot: "Histórico", qty: 2, unit_price: 100 },
      { id: "item-private", tenant_id: otherTenant, order_id: order, name_snapshot: "Privado", qty: 5, unit_price: 999 },
    ],
    conversations: [
      { id: conversation, tenant_id: tenant, customer_id: customer, status: "handoff", last_message_at: "2026-10-09" },
      { id: foreignConversation, tenant_id: otherTenant, customer_id: customer, status: "open", last_message_at: "2026-10-08" },
    ],
    messages: [
      { id: "a", tenant_id: tenant, conversation_id: conversation, body: "Viejo", created_at: "2026-10-07", raw: "secret raw", media_url: "private URL" },
      { id: "b", tenant_id: tenant, conversation_id: conversation, body: "x".repeat(2200), created_at: "2026-10-08" },
      { id: "c", tenant_id: tenant, conversation_id: conversation, transcript: "Reciente", created_at: "2026-10-09" },
      { id: "private", tenant_id: otherTenant, conversation_id: conversation, body: "Privado", created_at: "2026-10-10" },
    ],
    handoffs: [
      { id: "handoff-a", tenant_id: tenant, conversation_id: conversation, summary: "s".repeat(2100), status: "open", created_at: "2026-10-09" },
      { id: "handoff-private", tenant_id: otherTenant, conversation_id: conversation, summary: "Privado", status: "open", created_at: "2026-10-10" },
    ],
  };
});

const db = { from(table) {
  const entry = { table, filters: [], order: [] }; queries.push(entry);
  const q = {
    select(columns, options) { Object.assign(entry, { columns, options }); return q; },
    eq(key, value) { entry.filters.push([key, value]); return q; },
    order(key, options = {}) { entry.order.push([key, options.ascending !== false]); return q; },
    limit(limit) { entry.limit = limit; return q; },
    abortSignal(signal) { signal.throwIfAborted(); return q; },
    maybeSingle: async () => { const result = resultFor(entry); return { ...result, data: result.data?.[0] ?? null }; },
    then(resolve, reject) { return Promise.resolve(resultFor(entry)).then(resolve, reject); },
  };
  return q;
} };
function resultFor(entry) {
  if (entry.table === failure) return { data: null, count: null, error: { message: "private database details" } };
  const matched = tables[entry.table].filter(row => entry.filters.every(([key, value]) => row[key] === value));
  matched.sort((a, b) => {
    for (const [key, ascending] of entry.order) {
      const comparison = String(a[key] ?? "").localeCompare(String(b[key] ?? ""));
      if (comparison) return ascending ? comparison : -comparison;
    }
    return 0;
  });
  const data = matched.slice(0, entry.limit).map(row => Object.fromEntries(entry.columns.split(",").map(key => key.trim()).filter(key => key in row).map(key => [key, row[key]])));
  return { data, count: missingCount ? null : matched.length, error: null };
}
const run = (name, args, extra = {}) => executeOperatorReadTool(name, args, { supabase: db, tenantId: tenant, role: "viewer", ...extra });
const tenantScoped = () => assert.ok(queries.every(query => query.filters.some(([key, value]) => key === "tenant_id" && value === tenant)));

test("customer history is tenant scoped at every table and discloses limits instead of pretending completeness", async () => {
  const result = await run("get_customer_history", { customer_id: customer, limit: 1 });
  assert.equal(result.ok, true); assert.equal(result.data.total_orders, 2); assert.equal(result.data.orders_truncated, true);
  assert.equal(result.data.total_conversations, 1); assert.equal(result.data.conversations_truncated, false);
  assert.equal(result.data.orders[0].id, order); assert.equal(result.data.customer.notes.length, 2000); assert.equal(result.data.customer.notes_truncated, true);
  assert.equal(result.data.navigation.href, "/dashboard/orders"); tenantScoped();
});

test("foreign customers, orders and conversations fail before querying their children", async () => {
  for (const [name, args, table] of [
    ["get_customer_history", { customer_id: foreignCustomer }, "customers"],
    ["get_order_details", { order_id: foreignOrder }, "orders"],
    ["get_conversation", { conversation_id: foreignConversation }, "conversations"],
  ]) {
    queries = [];
    const result = await run(name, args);
    assert.equal(result.ok, false); assert.deepEqual(queries.map(query => query.table), [table]); tenantScoped();
  }
});

test("order details retain historical prices and exclude foreign child rows even for a verified order", async () => {
  const result = await run("get_order_details", { order_id: order });
  assert.equal(result.ok, true); assert.equal(result.data.items.length, 1); assert.equal(result.data.items[0].unit_price, 100);
  assert.equal(result.data.prices_scope, "historical_order"); assert.equal(result.data.total_items, 1);
  assert.equal(result.data.navigation.href, `/dashboard/orders/${order}`); tenantScoped();
});

test("conversation reads return the latest chronological excerpt, bounded text and no raw/media payload", async () => {
  const result = await run("get_conversation", { conversation_id: conversation, limit: 2 });
  assert.equal(result.ok, true); assert.deepEqual(result.data.messages.map(message => message.id), ["b", "c"]);
  assert.equal(result.data.total_messages, 3); assert.equal(result.data.truncated, true);
  assert.equal(result.data.messages[0].body.length, 2000); assert.equal(result.data.messages[0].text_truncated, true);
  assert.ok(result.data.messages.every(message => !Object.hasOwn(message, "raw") && !Object.hasOwn(message, "media_url")));
  tenantScoped();
});

test("conversation and human handoff filters cannot read another tenant or mutate attention state", async () => {
  const conversations = await run("list_conversations", { customer_id: customer, status: "handoff" });
  assert.equal(conversations.data.total_matches, 1); assert.equal(conversations.data.conversations[0].id, conversation);
  const handoffs = await run("list_handoffs", { conversation_id: conversation, status: "open" });
  assert.equal(handoffs.data.total_matches, 1); assert.equal(handoffs.data.handoffs[0].summary.length, 2000);
  assert.equal(handoffs.data.handoffs[0].summary_truncated, true); tenantScoped();
});

test("invalid inputs, unknown tools and missing membership fail before any CRM query", async () => {
  for (const [name, args, extra] of [
    ["get_customer_history", { customer_id: customer, tenant_id: otherTenant }],
    ["get_order_details", { order_id: "unknown" }],
    ["get_conversation", { conversation_id: conversation, limit: 1000 }],
    ["list_handoffs", { status: "taken", user_id: "spoofed" }],
    ["list_conversations", { status: "invented" }],
    ["get_conversation", { conversation_id: conversation }, { role: null }],
    ["get_conversation", { conversation_id: conversation }, { tenantId: "" }],
    ["resolve_handoff", { conversation_id: conversation }],
  ]) assert.equal((await run(name, args, extra)).ok, false);
  assert.equal(queries.length, 0);
});

test("partial database failures and missing exact counts produce controlled errors, never false empty histories", async () => {
  failure = "orders";
  const result = await run("get_customer_history", { customer_id: customer });
  assert.equal(result.ok, false); assert.doesNotMatch(result.error, /private database/);
  failure = null; missingCount = true;
  assert.equal((await run("list_conversations", {})).ok, false);
  const controller = new AbortController(); controller.abort(); queries = [];
  await assert.rejects(run("get_conversation", { conversation_id: conversation }, { signal: controller.signal }), { name: "AbortError" });
  assert.equal(queries.length, 0);
});
