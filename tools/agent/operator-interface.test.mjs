import test from "node:test";
import assert from "node:assert/strict";
import { load } from "./load.mjs";
const shared = await load("../../lib/crm-operator.ts");
const { completedOperatorNavigation, desktopPanelFallback } = await import(await load("../../lib/operator-interface.ts", { "./crm-operator": shared }));
const action = (overrides = {}) => ({ id: "step1", tool: "open_crm_panel", label: "Abrir CRM", kind: "navigation", status: "completed", navigation: { href: "/dashboard/orders", label: "Model label" }, ...overrides });

test("only a completed explicit navigation opens a workspace", () => {
  assert.deepEqual(completedOperatorNavigation([action()]), { href: "/dashboard/orders", label: "Pedidos" });
  assert.equal(completedOperatorNavigation([action({ kind: "read", tool: "list_orders" })]), null);
  assert.equal(completedOperatorNavigation([action({ status: "failed" })]), null);
  assert.equal(completedOperatorNavigation([action({ status: "running" })]), null);
  assert.equal(completedOperatorNavigation([action({ kind: "proposal", tool: "prepare_order_proposal", status: "approval_required" })]), null);
  assert.equal(completedOperatorNavigation([action({ navigation: { href: "https://example.com" } })]), null);
});

test("a newer failed navigation does not replay an earlier destination", () => {
  assert.equal(completedOperatorNavigation([action(), action({ id: "step2", status: "failed", navigation: undefined })]), null);
  assert.deepEqual(completedOperatorNavigation([action(), action({ id: "step2", navigation: { href: "/dashboard/catalog" } })]), { href: "/dashboard/catalog", label: "Catálogo" });
});

test("legacy desktop fallback keeps exact approved base panels", () => {
  assert.deepEqual(desktopPanelFallback("/dashboard/orders/11111111-1111-4111-8111-111111111111"), { href: "/dashboard/orders", label: "Pedidos" });
  for (const href of ["/dashboard/orders", "https://example.com/dashboard/orders/x", "/dashboard/orders/../billing", "/dashboard/orders/not-an-id", "/dashboard/unknown/x"]) assert.equal(desktopPanelFallback(href), null);
});
