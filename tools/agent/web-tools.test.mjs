import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { load, moduleUrl } from "./load.mjs";
let state;
beforeEach(() => { state = { queries: [], catalogCalls: 0, error: null, rows: [], count: 0 }; });
const db = { from(table) {
  const entry = { table, filters: [] }; state.queries.push(entry);
  const query = {
    select(columns, options) { Object.assign(entry, { columns, options }); return query; },
    eq(key, value) { entry.filters.push([key, "eq", value]); return query; },
    gte(key, value) { entry.filters.push([key, "gte", value]); return query; },
    lt(key, value) { entry.filters.push([key, "lt", value]); return query; },
    or(value) { entry.or = value; return query; }, order() { return query; },
    limit(value) { entry.limit = value; return query; }, abortSignal() { return query; },
    maybeSingle: async () => ({ data: state.stock, error: state.error }),
    then(resolve, reject) { return Promise.resolve({ data: state.rows, count: state.missingCount ? null : state.count, error: state.error }).then(resolve, reject); },
  }; return query;
} };
globalThis.__webCatalog = async (args, ctx) => { state.catalogCalls++; state.catalog = { args, ctx }; return { ok: true, data: { products: [] } }; };
const { executeWebToolCall, webCrmTools } = await import(await load("../../lib/agent/web-tools.ts", {
  zod: import.meta.resolve("zod"),
  "./operator": await load("../../lib/agent/operator.ts", { zod: import.meta.resolve("zod") }),
  "./tools": moduleUrl("export const AGENT_TOOLS = ['search_catalog','check_stock','confirm_order','create_draft_order'].map(name=>({type:'function',function:{name}})); export const searchCatalog=(...args)=>globalThis.__webCatalog(...args);"),
}));
const context = extra => ({ supabase: db, tenantId: "business-a", role: "owner", ...extra });
const run = (name, args = {}, extra = {}) => executeWebToolCall(name, args, context(extra));

test("web membership enables only CRM reads; guessed WhatsApp writes and missing membership never reach the database", async () => {
  assert.equal(webCrmTools("business-a", null).length, 0);
  assert.equal(webCrmTools(null, "owner").length, 0);
  assert.equal(webCrmTools("business-a", "viewer").length, 10);
  for (const name of ["confirm_order", "create_draft_order", "send_product_media", "escalate_to_human", "unknown"]) assert.equal((await run(name, { order_id: "known-order" })).ok, false);
  assert.equal((await run("get_business_overview", {}, { role: null })).ok, false);
  assert.equal(state.queries.length, 0);
});

test("customer searches strip filter syntax, reject tenant injection and disclose pagination", async () => {
  state.rows = [{ id: "customer-a", name: "Ana" }]; state.count = 27;
  const result = await run("search_customers", { query: 'Ana,phone.eq."x"%_(a)', limit: 1 }, { role: "viewer" });
  assert.equal(result.ok, true); assert.equal(result.data.truncated, true); assert.equal(result.data.total_matches, 27);
  assert.deepEqual(state.queries[0].filters, [["tenant_id", "eq", "business-a"]]);
  assert.equal(state.queries[0].or, "name.ilike.%Ana phone eq x a%,phone.ilike.%Ana phone eq x a%,city.ilike.%Ana phone eq x a%");
  assert.equal((await run("search_customers", { query: "Ana", tenant_id: "business-b" })).ok, false);
  assert.equal(state.queries.length, 1);
});

test("orders remain tenant scoped even when another customer's UUID is supplied; invalid filters do not run", async () => {
  const customer = "11111111-1111-4111-8111-111111111111";
  const result = await run("list_orders", { customer_id: customer, status: "pending_payment", since: "2026-10-01T00:00:00Z", until: "2026-10-07T00:00:00Z" });
  assert.equal(result.ok, true);
  assert.deepEqual(state.queries[0].filters.slice(0, 3), [["tenant_id", "eq", "business-a"], ["customer_id", "eq", customer], ["status", "eq", "pending_payment"]]);
  assert.equal((await run("list_orders", { limit: 100 })).ok, false);
  assert.equal((await run("list_orders", { since: "2026-10-08T00:00:00Z", until: "2026-10-07T00:00:00Z" })).ok, false);
  assert.equal((await run("list_orders", { status: "invented" })).ok, false);
  assert.equal(state.queries.length, 1);
});

test("overview uses exact counts instead of summing a limited sample; unavailable counts are not zero", async () => {
  state.count = 2300;
  const result = await run("get_business_overview", { days: 3 });
  assert.equal(result.data.recent_orders, 2300);
  assert.equal(Date.parse(result.data.until) - Date.parse(result.data.since), 3 * 86400000);
  assert.ok(state.queries.every(q => q.options.head && q.options.count === "exact" && q.filters.some(([key,,value]) => key === "tenant_id" && value === "business-a")));
  state.missingCount = true; assert.equal((await run("get_business_overview")).ok, false);
  state.error = { message: "private database details" };
  const failed = await run("list_orders"); assert.equal(failed.ok, false); assert.doesNotMatch(failed.error, /private database/);
});

test("web stock queries do not pretend the Jarvis user is a CRM customer or query a conversation UUID", async () => {
  state.stock = { sku: "SKU-A", stock_qty: 8, reserved_qty: 3, price_override: null, products: { price_retail: 50000 } };
  const result = await run("check_stock", { variant_sku: "SKU-A", qty: 6 });
  assert.equal(result.data.available, false); assert.equal(result.data.available_qty, 5); assert.equal(result.data.unit_price, 50000);
  assert.equal(state.queries.length, 1); assert.equal(state.queries[0].table, "product_variants");
  assert.ok(state.queries[0].filters.some(([key,,value]) => key === "products.tenant_id" && value === "business-a"));
  state.stock.stock_qty = 1; assert.equal((await run("check_stock", { variant_sku: "SKU-A" })).data.available_qty, 0);
});

test("catalog queries reuse the read implementation with a tenant-only context and validate the shared result limit", async () => {
  assert.equal((await run("search_catalog", { query: "bolso rojo", max_results: 10 })).ok, true);
  assert.equal(state.catalog.ctx.conversationId, undefined); assert.equal(state.catalog.ctx.customerId, undefined);
  assert.equal((await run("search_catalog", { query: "bolso", max_results: 11 })).ok, false);
  assert.equal(state.catalogCalls, 1);
});
