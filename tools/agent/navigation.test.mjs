import assert from "node:assert/strict";
import { test } from "node:test";
import { load } from "./load.mjs";

const { crmNavigationTools, executeCrmNavigation } = await import(await load("../../lib/agent/navigation.ts", {
  zod: import.meta.resolve("zod"), "@/lib/jarvis-commands": await load("../../lib/jarvis-commands.ts"),
}));
const { operatorAction } = await import(await load("../../lib/agent/operator-activity.ts", {
  "@/lib/crm-operator": await load("../../lib/crm-operator.ts"),
}));
const id = "11111111-2222-4333-8444-555555555555";
function fixture({ found = true, error = false, throws = false, role = "owner", tenantId = "tenant-a" } = {}) {
  const queries = [];
  const ctx = { role, tenantId, signal: new AbortController().signal, supabase: { from(table) {
    const filters = {};
    queries.push({ table, filters });
    const q = { select() { return q; }, eq(key, value) { filters[key] = value; return q; }, abortSignal(signal) { assert.equal(signal, ctx.signal); return q; },
      async maybeSingle() { if (throws) throw new Error("private-record-details"); return { data: found ? { id } : null, error: error ? { message: "private-database" } : null }; } };
    return q;
  } } };
  return { ctx, queries };
}

test("only authenticated CRM roles can request known panels, including WhatsApp and billing", async () => {
  for (const role of ["owner", "agent", "viewer"]) {
    const f = fixture({ role });
    const tools = crmNavigationTools(f.ctx.tenantId, role);
    assert.equal(tools.length, 1);
    for (const panel of tools[0].function.parameters.properties.panel.enum) {
      const result = await executeCrmNavigation({ panel }, f.ctx);
      assert.equal(result.ok, true);
      assert.equal(result.data.opened, false);
      assert.equal(result.data.interface_action, "open_panel");
    }
    assert.deepEqual(f.queries, []);
  }
  for (const options of [{ role: "admin" }, { role: null }, { tenantId: "" }]) {
    const f = fixture(options);
    assert.deepEqual(crmNavigationTools(f.ctx.tenantId, f.ctx.role), []);
    assert.equal((await executeCrmNavigation({ panel: "orders" }, f.ctx)).ok, false);
    assert.deepEqual(f.queries, []);
  }
});

test("URLs, traversal, unknown panels and injected tenant/role fields are rejected before querying", async () => {
  const f = fixture();
  for (const args of [
    { panel: "https://evil.test" }, { panel: "/dashboard/orders" }, { panel: "orders/../billing" },
    { panel: "orders", href: "/dashboard/billing" }, { panel: "orders", tenant_id: "foreign" },
    { panel: "orders", role: "owner" }, { panel: "orders", record_id: "../../admin" },
    { panel: "catalog", record_id: id }, { panel: "billing", record_id: id },
  ]) assert.equal((await executeCrmNavigation(args, f.ctx)).ok, false);
  assert.deepEqual(f.queries, []);
});

test("record navigation verifies its exact ID inside the active tenant, for viewers as well", async () => {
  for (const role of ["owner", "viewer"]) for (const panel of ["orders", "conversations", "handoffs"]) {
    const f = fixture({ role });
    const result = await executeCrmNavigation({ panel, record_id: id }, f.ctx);
    assert.equal(result.ok, true);
    assert.equal(result.data.navigation.href, `/dashboard/${panel}/${id}`);
    assert.deepEqual(f.queries, [{ table: panel, filters: { tenant_id: "tenant-a", id } }]);
  }
});

test("foreign, missing and unavailable records never produce a navigation target or private error", async () => {
  for (const options of [{ found: false }, { error: true }, { throws: true }]) {
    const f = fixture(options);
    const result = await executeCrmNavigation({ panel: "orders", record_id: id }, f.ctx);
    assert.equal(result.ok, false);
    assert.equal(result.data, undefined);
    assert.doesNotMatch(JSON.stringify(result), /private-/);
    const action = operatorAction("action-1", "open_crm_panel", result);
    assert.equal(action.status, "failed");
    assert.equal(action.navigation, undefined);
  }
});

test("operator evidence requires a canonical verified navigation and preserves explicit human approval", () => {
  assert.equal(operatorAction("action-1", "open_crm_panel").status, "running");
  for (const data of [{ navigation: { href: "https://evil.test" } }, { navigation: { href: "/dashboard/orders" } }]) {
    const action = operatorAction("action-1", "open_crm_panel", { ok: true, data });
    assert.equal(action.status, "failed");
    assert.equal(action.navigation, undefined);
  }
  const ready = operatorAction("action-1", "open_crm_panel", { ok: true, data: {
    navigation: { href: "/dashboard/orders", label: "untrusted title" }, destination_verified: true, interface_action: "open_panel", opened: false,
  } });
  assert.equal(ready.status, "completed");
  assert.deepEqual(ready.navigation, { href: "/dashboard/orders", label: "Pedidos" });
  for (const name of ["prepare_order_proposal", "prepare_repeat_order_proposal"]) {
    const action = operatorAction("action-2", name, { ok: true, data: { requires_click_confirmation: true, order_created: false } });
    assert.equal(action.status, "approval_required");
    assert.match(action.summary, /confirmar, cancelar/);
  }
});

test("cancellation prevents navigation queries", async () => {
  const f = fixture();
  f.ctx.signal = AbortSignal.abort();
  await assert.rejects(executeCrmNavigation({ panel: "orders", record_id: id }, f.ctx), /abort/i);
  assert.deepEqual(f.queries, []);
});
