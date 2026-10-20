import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { moduleUrl } from "../lib/load-module.mjs";

const url = source => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const { buildBriefing } = await import(await moduleUrl("lib/briefing.ts"));
const { jarvisCommand } = await import(await moduleUrl("lib/jarvis-commands.ts"));
const { createCatalogPreparation } = await import(await moduleUrl("lib/agent/catalog-actions.ts"));

const sales = (orders = 0, sales = 0, agentOrders = orders) => ({ conversations: 0, converted: 0, orders, sales, agentOrders, agentSales: sales, paidOrders: 0, collected: 0, recoveredOrders: 0, recovered: 0, handoffs: 0, avgReplyMs: null });
const facts = (extra = {}) => ({ date: "2026-10-14", today: sales(), yesterday: sales(), dayBefore: sales(), unpaid: { count: 0, total: 0, oldest: null },
  pendingApproval: 0, handoffs: { count: 0, oldest: null, customer: null }, lowStock: { count: 0, outOfStock: 0, items: [] }, tasksDue: 0, ...extra });
const morning = Date.parse("2026-10-14T13:00:00Z"); // 8:00 a. m. in Bogotá

test("the briefing states facts with actions, and the spoken version stays short", () => {
  const briefing = buildBriefing(facts({
    yesterday: sales(8, 1200000), dayBefore: sales(6, 1000000),
    unpaid: { count: 3, total: 450000, oldest: null },
    handoffs: { count: 2, oldest: new Date(morning - 2 * 3600000).toISOString(), customer: "María" },
    lowStock: { count: 1, outOfStock: 0, items: [{ name: "Tenis Urban · 40", sku: "TU-40", available: 2 }] },
    tasksDue: 1,
  }), { name: "David", now: morning });
  const text = Object.fromEntries(briefing.items.map(item => [item.id, item.text]));
  assert.match(text.yesterday, /^Ayer vendiste \$\s?1\.200\.000 en 8 pedidos \(20% más que el día anterior\)\. Zorax cerró todos\.$/);
  assert.equal(text.handoffs, "María y 1 cliente más esperan un asesor desde hace 2 h.");
  assert.match(text.unpaid, /^3 pedidos esperan pago por \$\s?450\.000\.$/);
  assert.equal(text.stock, "A Tenis Urban · 40 le quedan 2 unidades.");
  assert.equal(text.tasks, "Tienes 1 tarea para hoy.");
  assert.deepEqual(briefing.items.find(i => i.id === "stock").action, { label: "Actualizar stock", href: "/dashboard/catalog" });
  assert.ok(briefing.headline.startsWith("Buenos días, David. Ayer vendiste"));
  assert.ok(!briefing.headline.includes("tarea"), "only the three most useful facts are spoken");
  assert.ok(!briefing.items.some(i => i.id === "clear"));
});

test("a quiet day says so instead of inventing activity", () => {
  const briefing = buildBriefing(facts(), { now: Date.parse("2026-10-14T23:30:00Z") });
  assert.deepEqual(briefing.items.map(i => i.id), ["yesterday", "clear"]);
  assert.equal(briefing.items[0].text, "Ayer no hubo ventas confirmadas.");
  assert.ok(briefing.headline.startsWith("Buenas tardes."));
});

test("saying «resumen del día» is answered locally; other sentences still go to Zorax", () => {
  for (const text of ["Zorax, resumen del día", "¿Cómo vamos hoy?", "Nexo ¿cómo va mi negocio?", "dame el resumen"]) assert.equal(jarvisCommand(text), "briefing");
  for (const text of ["resume la conversación de Ana", "¿cómo vamos con el pedido de Ana?"]) assert.equal(jarvisCommand(text), null);
});

let state;
beforeEach(() => { state = { rpcs: [], response: { data: null, error: null } }; });
const supabase = { rpc(name, args) { state.rpcs.push({ name, args }); const result = state.response; return { abortSignal: async () => result }; } };
const proposal = (extra = {}) => ({ id: "11111111-1111-4111-8111-111111111111", session_id: "s-1", status: "pending", expires_at: "2026-10-14T13:15:00Z", product_id: null,
  snapshot: { action: "stock", title: "Actualizar stock", lines: [{ kind: "stock", variant_id: "22222222-2222-4222-8222-222222222222", product_id: "33333333-3333-4333-8333-333333333333", sku: "TU-40", label: "Tenis Urban · 40", before: 2, after: 22, reserved: 0 }] }, ...extra });
const prepare = (extra = {}) => createCatalogPreparation({ supabase, tenantId: "tenant-1", role: "owner", userId: "user-1", sessionId: "s-1", files: [], ...extra });

test("catalog changes are prepared for confirmation, only for owners and agents", async () => {
  assert.deepEqual(prepare({ role: "viewer" }).tools, []);
  assert.equal((await prepare({ role: "viewer" }).execute({ action: "stock", items: [{ sku: "TU-40", mode: "add", qty: 20 }] })).ok, false);
  assert.equal(state.rpcs.length, 0);
  state.response = { data: { ok: true, proposal: proposal() }, error: null };
  const catalog = prepare();
  assert.equal(catalog.tools[0].function.name, "propose_catalog_change");
  const result = await catalog.execute({ action: "stock", items: [{ sku: "TU-40", mode: "add", qty: 20 }] });
  assert.equal(result.ok, true); assert.equal(result.data.catalog_changed, false); assert.equal(result.data.requires_click_confirmation, true);
  assert.deepEqual(state.rpcs[0], { name: "nexo_catalog_change_by_nexo", args: { p_tenant: "tenant-1", p_user: "user-1", p_session: "s-1", p_change: { action: "stock", items: [{ sku: "TU-40", mode: "add", qty: 20 }] } } });
  assert.equal(catalog.proposals.length, 1);
  assert.match(catalog.tools[0].function.description, /NO aplica nada/, "with autonomy off the model is told nothing changes");
});

test("with stock autonomy on, an applied change is reported as done and undoable; anything else still waits", async () => {
  const catalog = prepare({ autonomy: { catalog_stock: true, catalog_availability: false } });
  assert.match(catalog.tools[0].function.description, /stock/); assert.doesNotMatch(catalog.tools[0].function.description, /NO aplica nada/);
  state.response = { data: { ok: true, auto: true, log_id: "66666666-6666-4666-8666-666666666666", proposal: proposal({ status: "applied", applied_by_nexo: true }) }, error: null };
  const done = await catalog.execute({ action: "stock", items: [{ sku: "TU-40", mode: "add", qty: 20 }] });
  assert.equal(done.data.applied_automatically, true); assert.equal(done.data.catalog_changed, true); assert.equal(done.data.requires_click_confirmation, false);
  assert.deepEqual(catalog.proposals[0].activity, { id: "66666666-6666-4666-8666-666666666666", status: "applied", undoable: true });
  state.response = { data: { ok: true, auto: true, proposal: proposal({ id: "77777777-7777-4777-8777-777777777777", status: "applied", applied_by_nexo: true }) }, error: null };
  assert.equal((await catalog.execute({ action: "stock", items: [{ sku: "TU-40", mode: "add", qty: 1 }] })).ok, false, "an applied change without its undo entry is not trusted");
  state.response = { data: { ok: true, auto: false, proposal: proposal({ id: "88888888-8888-4888-8888-888888888888", snapshot: { ...proposal().snapshot, action: "price" } }) }, error: null };
  const price = await catalog.execute({ action: "price", items: [{ sku: "TU", price: 1000 }] });
  assert.equal(price.data.requires_click_confirmation, true); assert.equal(price.data.catalog_changed, false);
});

test("invalid requests, foreign photos and unverifiable results never reach or leave the database as success", async () => {
  const catalog = prepare({ files: [{ id: "44444444-4444-4444-8444-444444444444", name: "lista.pdf" }] });
  assert.equal((await catalog.execute({ action: "price", items: [{ sku: "X", price: 10.5 }] })).ok, false);
  assert.equal((await catalog.execute({ action: "delete", items: [{ sku: "X" }] })).ok, false);
  assert.equal((await catalog.execute({ action: "create", attachment_id: "44444444-4444-4444-8444-444444444444", product: { name: "Tenis", price_retail: 1 } })).ok, false, "a PDF is not a product photo");
  assert.equal((await catalog.execute({ action: "create", attachment_id: "55555555-5555-4555-8555-555555555555", product: { name: "Tenis", price_retail: 1 } })).ok, false, "only photos attached in this conversation");
  assert.equal(state.rpcs.length, 0);
  state.response = { data: null, error: { message: "CATALOG_RESERVED" } };
  assert.match((await catalog.execute({ action: "stock", items: [{ sku: "TU-40", mode: "set", qty: 0 }] })).error, /reservadas/);
  state.response = { data: { ok: true, proposal: proposal({ session_id: "otra" }) }, error: null };
  assert.equal((await catalog.execute({ action: "stock", items: [{ sku: "TU-40", mode: "set", qty: 5 }] })).ok, false);
});

test("sales questions read the period from the database for this business only", async () => {
  const { executeWebToolCall, webCrmTools } = await import(await moduleUrl("lib/agent/web-tools.ts", {
    "./tools": url("export const AGENT_TOOLS=[]; export const searchCatalog=async()=>({ok:true});"),
    "./operator": url("export const OPERATOR_READ_TOOLS=[]; export const executeOperatorReadTool=async()=>({ok:false});"),
  }));
  assert.ok(webCrmTools("tenant-1", "viewer").some(tool => tool.function.name === "get_sales_results"));
  state.response = { data: { period: "yesterday", current: { sales: 1 } }, error: null };
  const result = await executeWebToolCall("get_sales_results", { period: "yesterday" }, { supabase, tenantId: "tenant-1", role: "viewer" });
  assert.equal(result.ok, true);
  assert.deepEqual(state.rpcs.at(-1), { name: "nexo_sales_period", args: { p_tenant: "tenant-1", p_period: "yesterday" } });
  assert.equal((await executeWebToolCall("get_sales_results", { period: "14", tenant_id: "otro" }, { supabase, tenantId: "tenant-1", role: "viewer" })).ok, false);
});
