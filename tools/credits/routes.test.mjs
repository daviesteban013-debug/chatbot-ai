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
const credits=url("export async function getCreditBalance(account){const s=globalThis.__creditRouteState();s.account=account;if(s.failure)throw new Error('private database detail');return {availableTokens:250,quotaTokens:1000};}");
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

// Stripe is stubbed at the boundary; actual quota changes are covered by SQL tests.
globalThis.__creditStripeDb=()=>({from(){
  const filters={};let writes;
  const q={select(){return q;},eq(key,value){filters[key]=value;return q;},
    update(values){writes=values;return q;},
    async maybeSingle(){if(state.dbFailure)return {data:null,error:{message:"failure"}};return {data:filters.id ? state.target : state.existing,error:null};},
    async single(){state.writes.push({filters,values:writes});return {data:{id:filters.id},error:state.dbFailure?{message:"failure"}:null};},
    then(resolve,reject){if(writes)state.writes.push({filters,values:writes});return Promise.resolve({data:null,error:state.dbFailure?{message:"failure"}:null}).then(resolve,reject);},
  };return q;
}});
const stripeModule=await load("../../lib/stripe/activate-plan.ts",{
  "@supabase/supabase-js":url("export const createClient=()=>globalThis.__creditStripeDb();"),
  "@/lib/plans":url("export const plans=[{id:'esencial'},{id:'crecimiento'},{id:'equipo'}];"),
  "@/lib/stripe/server":url("export function getStripe(){return {subscriptions:{retrieve:async()=>globalThis.__creditRouteState().currentSubscription}};}"),
});
const billing=await import(stripeModule);
const sub=(extra={})=>({id:"sub-test",customer:"cus-test",status:"active",metadata:{planId:"crecimiento",tenant_id:"tenant-1",period:"monthly"},items:{data:[{current_period_end:Math.floor(Date.now()/1000)+86400}]},...extra});
test("an existing subscription updates its plan and verified validity without resetting its paid date",async()=>{
  state.existing={id:"tenant-1",plan_paid_at:"2026-01-01T00:00:00Z"};state.writes=[];
  const result=await billing.activatePlanFromSubscription(sub(),"tenant-1");
  assert.equal(result.ok,true);assert.equal(result.alreadyActive,true);
  assert.equal(state.writes[0].values.plan,"crecimiento");assert.equal(state.writes[0].values.stripe_subscription_status,"active");
  assert.equal(state.writes[0].values.plan_paid_at,state.existing.plan_paid_at);
});
test("cancellation updates only the currently assigned subscription; foreign or expired claims fail",async()=>{
  state.existing={id:"tenant-1"};state.writes=[];
  await billing.synchronizeSubscription(sub({status:"canceled"}));
  assert.deepEqual(state.writes[0].filters,{id:"tenant-1",stripe_subscription_id:"sub-test"});
  assert.equal(state.writes[0].values.stripe_subscription_status,"canceled");
  assert.equal((await billing.activatePlanFromSubscription(sub(),"other-tenant")).ok,false);
  assert.equal((await billing.activatePlanFromSubscription(sub({items:{data:[]}}),"tenant-1")).ok,false);
});
test("webhook retrieves current Stripe state; failed synchronization returns a retryable response",async()=>{
  const stripe=url("export function getStripe(){const s=globalThis.__creditRouteState();return {webhooks:{constructEvent:()=>s.event},subscriptions:{retrieve:async()=>s.currentSubscription}};}");
  const webhook=await import(await load("../../app/api/stripe/webhook/route.ts",{"next/server":next,"@/lib/stripe/server":stripe,"@/lib/stripe/activate-plan":stripeModule}));
  const originalSecret=process.env.STRIPE_WEBHOOK_SECRET;process.env.STRIPE_WEBHOOK_SECRET="test-secret";
  try{
    state.existing={id:"tenant-1"};state.writes=[];
    state.event={type:"customer.subscription.updated",data:{object:sub()}};
    state.currentSubscription=sub({status:"canceled"});
    const request=()=>new Request("https://example.com/webhook",{method:"POST",headers:{"stripe-signature":"test"},body:"fixture"});
    assert.equal((await webhook.POST(request())).status,200);
    assert.equal(state.writes[0].values.stripe_subscription_status,"canceled");
    state.dbFailure=true;assert.equal((await webhook.POST(request())).status,503);
  }finally{if(originalSecret===undefined)delete process.env.STRIPE_WEBHOOK_SECRET;else process.env.STRIPE_WEBHOOK_SECRET=originalSecret;}
});
test("a delayed active event from an old subscription cannot replace a new assigned subscription",async()=>{
  state.existing=null;state.target={stripe_subscription_id:"sub-new"};state.writes=[];
  assert.equal(await billing.synchronizeSubscription(sub()),null);
  assert.equal(state.writes.length,0);
});
