import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { moduleUrl } from "../lib/load-module.mjs";

const url = source => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
let state;
globalThis.__activityState = () => state;
const log = "11111111-1111-4111-8111-111111111111";
beforeEach(() => { state = { user: { id: "user-1" }, tenant: { tenantId: "tenant-1", role: "agent" }, rpc: [], result: { data: { ok: true }, error: null } }; });

const route = await import(await moduleUrl("app/api/jarvis/activity/route.ts", {
  "next/server": url("export const NextResponse={json:(d,o)=>Response.json(d,o)};"),
  "@/lib/auth": url("export const getCurrentUser=async()=>globalThis.__activityState().user;export const getCurrentTenant=async()=>globalThis.__activityState().tenant;"),
  "@/lib/supabase/admin": url("export const createAdminClient=()=>({rpc:async(name,args)=>{const s=globalThis.__activityState();s.rpc.push({name,args});return s.result;}});"),
}));
const request = (method, body, origin = "https://nexo.test") => Object.assign(new Request("https://nexo.test/api/jarvis/activity?limit=99", {
  method, headers: { origin, "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
}), { nextUrl: new URL("https://nexo.test/api/jarvis/activity?limit=99") });

test("undo needs a same-origin click from an owner or agent of the business", async () => {
  assert.equal((await route.POST(request("POST", { log_id: log }, "https://evil.test"))).status, 403);
  assert.equal((await route.POST(request("POST", { log_id: "x" }))).status, 400);
  state.user = null; assert.equal((await route.POST(request("POST", { log_id: log }))).status, 401);
  state.user = { id: "user-1" }; state.tenant.role = "viewer";
  assert.equal((await route.POST(request("POST", { log_id: log }))).status, 403);
  assert.equal(state.rpc.length, 0);
  state.tenant.role = "agent";
  assert.equal((await route.POST(request("POST", { log_id: log }))).status, 200);
  assert.deepEqual(state.rpc[0], { name: "nexo_undo_activity", args: { p_tenant: "tenant-1", p_user: "user-1", p_log: log } });
});

test("refused undos explain why, and the business always comes from the session", async () => {
  state.result = { data: { ok: false, code: "changed" }, error: null };
  const changed = await route.POST(request("POST", { log_id: log, tenant_id: "other" }));
  assert.equal(changed.status, 400, "unknown fields are rejected");
  const response = await route.POST(request("POST", { log_id: log }));
  assert.equal(response.status, 409); assert.match((await response.json()).error, /Alguien cambió/);
});

test("the feed is limited, server-scoped and empty for viewers", async () => {
  state.result = { data: [{ at: "2026-10-14T12:00:00Z", kind: "sale", text: "Vendió $189.000 a Ana por WhatsApp", href: "/dashboard/orders/1", log_id: null, status: "applied", undoable: false }], error: null };
  const response = await route.GET(request("GET"));
  assert.equal((await response.json()).items.length, 1);
  assert.deepEqual(state.rpc[0].args, { p_tenant: "tenant-1", p_user: "user-1", p_limit: 30 });
  state.result = { data: [{ at: "x", kind: "sale", text: "x", href: "https://evil.test", log_id: null, status: "applied", undoable: false }], error: null };
  assert.equal((await route.GET(request("GET"))).status, 503, "links outside the panel are never passed to the browser");
  state.tenant.role = "viewer"; state.rpc = [];
  assert.deepEqual((await (await route.GET(request("GET"))).json()).items, []); assert.equal(state.rpc.length, 0);
});

const { saveAutonomy } = await import(await moduleUrl("app/dashboard/agent/autonomy-actions.ts", {
  "next/cache": url("export const revalidatePath=()=>{};"),
  "@/lib/auth": url("export const getCurrentUser=async()=>globalThis.__activityState().user;export const getCurrentTenant=async()=>globalThis.__activityState().tenant;"),
  "@/lib/supabase/admin": url("export const createAdminClient=()=>({rpc:async(name,args)=>{const s=globalThis.__activityState();s.rpc.push({name,args});return s.result;}});"),
}));

test("only the owner changes autonomy, and only the three low-risk switches exist", async () => {
  const all = { catalog_stock: true, catalog_availability: false, work_items: true };
  assert.equal((await saveAutonomy(all)).ok, false, "agents cannot change it");
  state.tenant.role = "owner";
  assert.equal((await saveAutonomy({ ...all, prices: true })).ok, false);
  assert.equal((await saveAutonomy({ catalog_stock: "yes", catalog_availability: false, work_items: false })).ok, false);
  assert.equal(state.rpc.length, 0);
  state.result = { data: {}, error: null };
  assert.equal((await saveAutonomy(all)).ok, true);
  assert.deepEqual(state.rpc[0], { name: "nexo_configure_autonomy", args: { p_tenant: "tenant-1", p_user: "user-1", p_settings: all } });
});
