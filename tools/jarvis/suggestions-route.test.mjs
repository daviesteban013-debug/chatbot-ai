import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { moduleUrl } from "../lib/load-module.mjs";

const url = source => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
let state;
globalThis.__suggestionState = () => state;
beforeEach(() => { state = { user: { id: "user-1" }, tenant: { tenantId: "tenant-1", role: "owner" }, rpc: [], result: { data: [{ key: "catalog_stock", confirmed: 6, rejected: 1, undone: 0 }], error: null } }; });

const route = await import(await moduleUrl("app/api/jarvis/suggestions/route.ts", {
  "next/server": url("export const NextResponse={json:(d,o)=>Response.json(d,o)};"),
  "@/lib/auth": url("export const getCurrentUser=async()=>globalThis.__suggestionState().user;export const getCurrentTenant=async()=>globalThis.__suggestionState().tenant;"),
  "@/lib/supabase/admin": url("export const createAdminClient=()=>({rpc:async(name,args)=>{const s=globalThis.__suggestionState();s.rpc.push({name,args});return name==='nexo_automation_suggestions'?s.result:{data:{},error:s.writeError??null};}});"),
}));
const request = (method, body, origin = "https://nexo.test") => Object.assign(new Request("https://nexo.test/api/jarvis/suggestions", {
  method, headers: { origin, "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
}), { nextUrl: new URL("https://nexo.test/api/jarvis/suggestions") });

test("suggestions are read for the owner only and validated before reaching the screen", async () => {
  const response = await route.GET();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { suggestions: [{ key: "catalog_stock", confirmed: 6, rejected: 1, undone: 0 }] });
  assert.deepEqual(state.rpc[0], { name: "nexo_automation_suggestions", args: { p_tenant: "tenant-1", p_user: "user-1" } });
  state.tenant.role = "agent"; state.rpc = [];
  assert.deepEqual(await (await route.GET()).json(), { suggestions: [] }); assert.equal(state.rpc.length, 0);
  state.tenant.role = "owner"; state.result = { data: [{ key: "prices", confirmed: 1 }], error: null };
  assert.equal((await route.GET()).status, 503, "an unexpected key never reaches the client");
  state.user = null;
  assert.equal((await route.GET()).status, 401);
});

test("enable flips exactly one switch; dismiss hides for 30 days; both need the owner and a same-origin click", async () => {
  assert.equal((await route.POST(request("POST", { key: "catalog_stock", action: "enable" }, "https://evil.test"))).status, 403);
  assert.equal((await route.POST(request("POST", { key: "prices", action: "enable" }))).status, 400);
  assert.equal((await route.POST(request("POST", { key: "catalog_stock", action: "enable", tenant_id: "x" }))).status, 400);
  state.tenant.role = "agent";
  assert.equal((await route.POST(request("POST", { key: "catalog_stock", action: "enable" }))).status, 403);
  assert.equal(state.rpc.length, 0);
  state.tenant.role = "owner";
  const enabled = await route.POST(request("POST", { key: "learn_from_chat", action: "enable" }));
  assert.equal(enabled.status, 200);
  assert.deepEqual(state.rpc[0], { name: "nexo_configure_autonomy", args: { p_tenant: "tenant-1", p_user: "user-1", p_settings: { learn_from_chat: true } } });
  const dismissed = await route.POST(request("POST", { key: "work_items", action: "dismiss" }));
  assert.equal(dismissed.status, 200);
  assert.deepEqual(state.rpc[1], { name: "nexo_dismiss_suggestion", args: { p_tenant: "tenant-1", p_user: "user-1", p_key: "work_items" } });
  state.writeError = { message: "AUTONOMY_OWNER_REQUIRED" };
  const refused = await route.POST(request("POST", { key: "work_items", action: "enable" }));
  assert.equal(refused.status, 409); assert.match((await refused.json()).error, /dueño/);
});
