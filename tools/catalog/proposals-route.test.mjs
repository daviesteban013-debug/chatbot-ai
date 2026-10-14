import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { moduleUrl } from "../lib/load-module.mjs";

const url = source => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
let state;
globalThis.__catalogRouteState = () => state;
const id = "11111111-1111-4111-8111-111111111111";
const applied = { id, session_id: "s-1", status: "applied", expires_at: "2026-10-14T13:15:00Z", product_id: "22222222-2222-4222-8222-222222222222",
  snapshot: { action: "create", title: "Agregar producto", lines: [{ kind: "create", label: "Tenis", after: 1000, variants: [{ stock_qty: 1 }] }] } };
beforeEach(() => { state = { user: { id: "user-1" }, row: null, rpc: [], stored: [] }; });

const route = await import(await moduleUrl("app/api/jarvis/catalog-proposals/route.ts", {
  "next/server": url("export const NextResponse={json:(d,o)=>Response.json(d,o)};"),
  "@/lib/supabase/server": url("export const createClient=async()=>({auth:{getUser:async()=>({data:{user:globalThis.__catalogRouteState().user}})}});"),
  "@/lib/supabase/admin": url(`export const createAdminClient=()=>{const s=globalThis.__catalogRouteState();return {
    from(table){const q={select(){return q;},eq(){return q;},maybeSingle:async()=>({data:table==='nexo_catalog_proposals'?s.row:{object_path:'user-1/photo'},error:null})};return q;},
    storage:{from:()=>({download:async()=>({data:new Blob([new Uint8Array([1,2,3])])})})},
    async rpc(name,args){s.rpc.push({name,args});return {data:{ok:true,proposal:${JSON.stringify(applied)}},error:null};}};};`),
  "@/lib/catalog/photos": url("export const toProductJpeg=async(d)=>Buffer.from(d); export const storeProductPhoto=async(t,j)=>{globalThis.__catalogRouteState().stored.push(t);return 'https://x.supabase.co/storage/v1/object/public/product-images/'+t+'/a.jpg';};"),
}));
const post = (body, origin = "https://nexo.test") => Object.assign(new Request("https://nexo.test/api/jarvis/catalog-proposals", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) }), { nextUrl: new URL("https://nexo.test/api/jarvis/catalog-proposals") });

test("decisions need a same-origin click from a signed-in user", async () => {
  assert.equal((await route.POST(post({ id, decision: "confirm" }, "https://evil.test"))).status, 403);
  state.user = null; assert.equal((await route.POST(post({ id, decision: "confirm" }))).status, 401);
  state.user = { id: "user-1" }; assert.equal((await route.POST(post({ id, decision: "apply-all" }))).status, 400);
  assert.equal(state.rpc.length, 0);
});

test("confirming a new product copies the chat photo to the product bucket before creating it", async () => {
  state.row = { tenant_id: "tenant-1", status: "pending", snapshot: { attachment_id: "33333333-3333-4333-8333-333333333333" } };
  const response = await route.POST(post({ id, decision: "confirm" }));
  assert.equal(response.status, 200);
  assert.deepEqual(state.stored, ["tenant-1"]);
  assert.deepEqual(state.rpc[0], { name: "nexo_decide_catalog_change", args: { p_id: id, p_user: "user-1", p_decision: "confirm", p_image_url: "https://x.supabase.co/storage/v1/object/public/product-images/tenant-1/a.jpg" } });
  state.rpc = []; state.stored = [];
  await route.POST(post({ id, decision: "cancel" }));
  assert.deepEqual(state.stored, [], "cancel never touches photos");
  assert.equal(state.rpc[0].args.p_image_url, null);
});
