import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { load, moduleUrl } from "../agent/load.mjs";

const userId = crypto.randomUUID();
const tenantId = crypto.randomUUID();
const followupId = crypto.randomUUID();
let state;
beforeEach(() => {
  state = { user: { id: userId }, tenant: { tenantId, role: "owner" }, calls: [], revalidated: [], error: null, response: null, throws: false };
});
globalThis.__followupActionUser = () => state.user;
globalThis.__followupActionTenant = () => state.tenant;
globalThis.__followupActionRevalidate = (...args) => state.revalidated.push(args);
globalThis.__followupActionRpc = (name, args) => {
  state.calls.push({ name, args });
  if (state.throws) throw new Error("private provider token");
  return Promise.resolve({ error: state.error, data: state.response ?? (name === "nexo_configure_sales_followups"
    ? { enabled: args.p_enabled, delay_minutes: args.p_delay, max_reminders: args.p_max }
    : { id: args.p_id, status: "canceled" }) });
};
const { saveSalesFollowups, cancelSalesFollowup } = await import(await load("../../app/dashboard/agent/followup-actions.ts", {
  "zod": import.meta.resolve("zod"),
  "next/cache": moduleUrl("export const revalidatePath=(...args)=>globalThis.__followupActionRevalidate(...args);"),
  "@/lib/auth": moduleUrl("export const getCurrentUser=async()=>globalThis.__followupActionUser();export const getCurrentTenant=async()=>globalThis.__followupActionTenant();"),
  "@/lib/supabase/admin": moduleUrl("export const createAdminClient=()=>({rpc:(...args)=>globalThis.__followupActionRpc(...args)});"),
}));
const settings = { enabled: true, delayMinutes: 120, maxReminders: 1 };

test("followup settings derive business and actor on the server; only authenticated owners can save", async () => {
  for (const role of ["viewer", "agent"]) {
    state.tenant.role = role;
    assert.equal((await saveSalesFollowups(settings)).ok, false);
  }
  state.tenant.role = "owner";
  state.user.is_anonymous = true;
  assert.equal((await saveSalesFollowups(settings)).ok, false);
  state.user = null;
  assert.equal((await saveSalesFollowups(settings)).ok, false);
  assert.equal(state.calls.length, 0);
  state.user = { id: userId };
  assert.equal((await saveSalesFollowups(settings)).ok, true);
  assert.deepEqual(state.calls[0], { name: "nexo_configure_sales_followups", args: { p_tenant: tenantId, p_user: userId, p_enabled: true, p_delay: 120, p_max: 1 } });
  assert.deepEqual(state.revalidated, [["/dashboard/agent"], ["/dashboard/conversations", "layout"]]);
});

test("followup settings reject forged scope, coercions, and bounds before reaching the database", async () => {
  for (const invalid of [
    { ...settings, tenant_id: crypto.randomUUID() }, { ...settings, user_id: crypto.randomUUID() },
    { ...settings, enabled: "true" }, { ...settings, delayMinutes: "120" },
    { ...settings, delayMinutes: 29 }, { ...settings, delayMinutes: 721 }, { ...settings, delayMinutes: 30.1 },
    { ...settings, maxReminders: 0 }, { ...settings, maxReminders: 3 },
  ]) assert.equal((await saveSalesFollowups(invalid)).ok, false);
  assert.equal(state.calls.length, 0);
  assert.equal((await saveSalesFollowups({ enabled: false, delayMinutes: 30, maxReminders: 2 })).ok, true);
});

test("cancellation allows owners and agents, validates identifier, and never accepts browser scope", async () => {
  state.tenant.role = "viewer";
  assert.equal((await cancelSalesFollowup({ id: followupId })).ok, false);
  state.tenant.role = "agent";
  for (const invalid of [{ id: "anything" }, { id: followupId, tenantId }, { id: followupId, p_user: userId }]) {
    assert.equal((await cancelSalesFollowup(invalid)).ok, false);
  }
  assert.equal(state.calls.length, 0);
  assert.equal((await cancelSalesFollowup({ id: followupId })).ok, true);
  assert.deepEqual(state.calls[0], { name: "nexo_cancel_sales_followup", args: { p_tenant: tenantId, p_user: userId, p_id: followupId } });
  state.user.is_anonymous = true;
  assert.equal((await cancelSalesFollowup({ id: followupId })).ok, false);
  state.user = { id: userId };
  state.tenant = null;
  assert.equal((await cancelSalesFollowup({ id: followupId })).ok, false);
});

test("database failures and unexpected receipts never report success or reveal internal details", async () => {
  state.error = { message: "private SQL provider token" };
  assert.equal((await saveSalesFollowups(settings)).ok, false);
  const denied = await cancelSalesFollowup({ id: followupId });
  assert.equal(denied.ok, false);
  assert.doesNotMatch(denied.error, /private|token|SQL/);
  state.error = { message: "SALES_FOLLOWUP_ALREADY_DISPATCHED private SQL" };
  assert.match((await cancelSalesFollowup({ id: followupId })).error, /ya comenzó o terminó/);
  state.error = null;
  state.response = {};
  assert.equal((await saveSalesFollowups(settings)).ok, false);
  assert.equal((await cancelSalesFollowup({ id: followupId })).ok, false);
  state.throws = true;
  assert.equal((await saveSalesFollowups(settings)).ok, false);
  assert.equal((await cancelSalesFollowup({ id: followupId })).ok, false);
  assert.equal(state.revalidated.length, 0);
});
