import assert from "node:assert/strict";
import { test, beforeEach, after } from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const url = source => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
async function load(relative,replacements={}) {
  let source=await readFile(new URL(relative,import.meta.url),"utf8");
  for (const [from,to] of Object.entries(replacements)) source=source.replaceAll(`"${from}"`,`"${to}"`);
  return url(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText);
}
let state;
globalThis.__creditRouteState = () => state;
const next=url("export const NextResponse = {json:(data,options)=>new Response(JSON.stringify(data),{...options,headers:options?.headers})};");
const auth=url("export const getCurrentUser=async()=>globalThis.__creditRouteState().user; export const getCurrentTenant=async()=>globalThis.__creditRouteState().tenant;");
const credits=url("export async function getMessageBalance(account){const s=globalThis.__creditRouteState();s.account=account;if(s.failure)throw new Error('private database detail');return {availableMessages:25,quotaMessages:40};} export async function getCreditBalance(account){globalThis.__creditRouteState().whatsappAccount=account;return {availableTokens:250,quotaTokens:1000};}");
const balanceRoute=await import(await load("../../app/api/credits/route.ts",{"next/server":next,"@/lib/auth":auth,"@/lib/credits/server":credits}));
const simulate=await import(await load("../../app/api/dev/simulate/route.ts",{
  "next/server":next,"@/lib/auth":auth,
  "@/lib/supabase/admin":url("export function createAdminClient(){globalThis.__creditRouteState().adminCalls++;throw new Error('should not reach database');}"),
  "@/lib/agent/loop":url("export async function runAgent(){throw new Error('should not run');}"),
}));
const originalEnv=process.env.NODE_ENV;
beforeEach(()=>{state={user:{id:"user-1"},tenant:{tenantId:"tenant-1",role:"owner"},adminCalls:0};});
after(()=>{if(originalEnv===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=originalEnv;});
test("balance identity comes from the authenticated account, and responses are never cached",async()=>{
  const response=await balanceRoute.GET(new Request("https://example.com/api/credits?tenantId=other-tenant"));
  assert.equal(response.status,200);assert.match(response.headers.get("cache-control"),/no-store/);
  assert.deepEqual(state.account,{tenantId:"tenant-1",userId:"user-1",channel:"web"});
});
test("anonymous balance access is rejected; database failure never looks like an unlimited or empty wallet",async()=>{
  state.user=null;assert.equal((await balanceRoute.GET()).status,401);assert.equal(state.account,undefined);
  state.user={id:"user-1"};state.failure=true;
  const response=await balanceRoute.GET();assert.equal(response.status,503);assert.doesNotMatch(await response.text(),/private database/);
});
test("the simulator cannot consume any tenant credits in production or without operational membership",async()=>{
  const request={json:async()=>({tenantSlug:"other-tenant"})};
  process.env.NODE_ENV="production";assert.equal((await simulate.POST(request)).status,404);
  process.env.NODE_ENV="development";state.tenant=null;assert.equal((await simulate.POST(request)).status,403);
  state.tenant={tenantId:"tenant-1",role:"viewer"};assert.equal((await simulate.POST(request)).status,403);
  assert.equal(state.adminCalls,0);
});
