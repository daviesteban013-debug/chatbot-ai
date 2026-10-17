import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { moduleUrl } from "../lib/load-module.mjs";

const url = source => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
let state;
globalThis.__pulseState = () => state;
beforeEach(() => { state = { user: { id: "user-1" }, tenant: { tenantId: "tenant-1", role: "viewer" }, rpc: [], result: { data: null, error: null } }; });
const stubs = {
  "next/server": url("export const NextResponse={json:(d,o)=>Response.json(d,o)};"),
  "@/lib/auth": url("export const getCurrentUser=async()=>globalThis.__pulseState().user;export const getCurrentTenant=async()=>globalThis.__pulseState().tenant;"),
  "@/lib/supabase/admin": url("export const createAdminClient=()=>({rpc:async(name,args)=>{const s=globalThis.__pulseState();s.rpc.push({name,args});return s.result;}});"),
};
const pulse = await import(await moduleUrl("app/api/jarvis/pulse/route.ts", stubs));
const week = await import(await moduleUrl("app/api/jarvis/week/route.ts", stubs));
const empty = { at: "2026-10-14T15:00:00Z", handoffs: [], approvals: [], payments: [], sales: [], stockouts: [], tasks: [] };

test("the pulse needs a signed-in member and always uses the session's business", async () => {
  state.user = null; assert.equal((await pulse.GET()).status, 401); assert.equal(state.rpc.length, 0);
  state.user = { id: "user-1" }; state.result = { data: empty, error: null };
  const response = await pulse.GET();
  assert.equal(response.status, 200); assert.deepEqual((await response.json()).pulse, { ...empty, jobs: [] }, "older pulses gain an empty jobs list");
  assert.deepEqual(state.rpc[0], { name: "nexo_pulse", args: { p_tenant: "tenant-1", p_user: "user-1" } });
  assert.equal(response.headers.get("cache-control"), "private, no-store");
});

test("malformed pulses and database errors are reported, never passed through", async () => {
  state.result = { data: { ...empty, handoffs: [{ id: "not-a-uuid" }] }, error: null };
  assert.equal((await pulse.GET()).status, 503);
  state.result = { data: null, error: { message: "private" } };
  const response = await pulse.GET();
  assert.equal(response.status, 503); assert.doesNotMatch(JSON.stringify(await response.json()), /private/);
});

test("the weekly routine reads the last 7 days for this business", async () => {
  state.result = { data: { days: 7 }, error: null };
  assert.equal((await week.GET()).status, 200);
  assert.deepEqual(state.rpc[0], { name: "nexo_sales_metrics", args: { p_tenant: "tenant-1", p_user: "user-1", p_days: 7 } });
});
