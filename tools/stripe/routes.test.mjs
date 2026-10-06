import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { moduleUrl } from "./load-module.mjs";

const source = code => `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
let state;
globalThis.__stripeTest = () => state;
const substitutions = {
  "next/server": source("export const NextResponse={json:(data,options)=>new Response(JSON.stringify(data),options)};"),
  "@/lib/auth": source("export const getCurrentTenant=async()=>globalThis.__stripeTest().tenant;"),
  "@/lib/stripe/server": source("export const getStripe=()=>globalThis.__stripeTest().stripe;"),
  "@/lib/stripe/billing": source(`export const assertBillingMode=async()=>{if(globalThis.__stripeTest().modeFailure)throw Error('mode');};
    export const billingAccount=async()=>{globalThis.__stripeTest().accountCalls++;return {customer_id:'cus_ours'};};
    export const currentSubscription=async()=>globalThis.__stripeTest().subscription;
    export const billingDatabase=()=>({rpc:async()=>({data:{ok:true,attempt:'same-attempt',expiresAt:2000000000},error:null})});`),
  "@/lib/stripe/sync-plan": source("export const getOrCreateStripePrice=async()=> 'price_server';"),
  "@/lib/stripe/activate-plan": source("export const synchronizeSubscription=async()=>{globalThis.__stripeTest().syncCalls++;return {ok:true};};"),
};
const checkout = await import(await moduleUrl("app/api/stripe/checkout/route.ts",substitutions));
const portal = await import(await moduleUrl("app/api/stripe/portal/route.ts",substitutions));
const verify = await import(await moduleUrl("app/api/stripe/verify/route.ts",substitutions));
const request = (body={},origin="https://chatbot-ai-gold-two.vercel.app") => new Request("https://chatbot-ai-gold-two.vercel.app/api/stripe/test", {method:"POST",headers:{origin,"content-type":"application/json"},body:JSON.stringify(body)});
beforeEach(()=>{
  state={tenant:{tenantId:"our-tenant",role:"owner"},accountCalls:0,syncCalls:0,subscription:null,open:[],session:{customer:"cus_ours",client_reference_id:"our-tenant",livemode:false,status:"complete",payment_status:"paid",subscription:"sub_ours"}};
  state.stripe={checkout:{sessions:{list:async()=>({data:state.open}),create:async(params,options)=>{state.created={params,options};return {url:"https://checkout.stripe.com/test"};},retrieve:async()=>state.session}},subscriptions:{retrieve:async()=>({})},billingPortal:{configurations:{retrieve:async()=>({active:true,livemode:false})},sessions:{create:async params=>{state.portal=params;return {url:"https://billing.stripe.com/test"};}}}};
});
test("anonymous users, staff and cross-origin requests cannot create charges or open another business's portal",async()=>{
  for(const handler of [checkout,portal,verify]) {
    state.tenant=null;assert.equal((await handler.POST(request())).status,401);
    state.tenant={tenantId:"our-tenant",role:"viewer"};assert.equal((await handler.POST(request())).status,403);
    state.tenant.role="owner";assert.equal((await handler.POST(request({},"https://evil.example"))).status,403);
  }
  assert.equal(state.accountCalls,0);
});
test("amount, price, customer and business sent by a browser are ignored; only the server catalog and membership bind the subscription",async()=>{
  const response=await checkout.POST(request({planId:"esencial",annual:false,price:"price_free",amount:0,customer:"cus_victim",tenantId:"victim"}));
  assert.equal(response.status,200);
  assert.deepEqual(state.created.params.line_items,[{price:"price_server",quantity:1}]);
  assert.equal(state.created.params.customer,"cus_ours");
  assert.equal(state.created.params.subscription_data.metadata.tenant_id,"our-tenant");
  assert.equal(state.created.options.idempotencyKey,"nexo-checkout-same-attempt");
});
test("a second subscription is blocked; retries reuse the pending checkout without creating another session",async()=>{
  state.subscription={status:"active"};assert.equal((await checkout.POST(request({planId:"esencial",annual:false}))).status,409);
  state.subscription=null;state.open=[{metadata:{planId:"esencial",period:"monthly"},url:"https://checkout.stripe.com/pending"}];
  assert.equal((await checkout.POST(request({planId:"esencial",annual:false}))).status,200);assert.equal(state.created,undefined);
});
test("unknown plans, malformed data and mode mismatch fail before creating a Checkout session",async()=>{
  assert.equal((await checkout.POST(request({planId:"free",annual:false}))).status,400);
  assert.equal((await checkout.POST(request(null))).status,400);
  state.modeFailure=true;assert.equal((await checkout.POST(request({planId:"esencial",annual:false}))).status,503);assert.equal(state.created,undefined);
});
test("a success URL does not authorize a foreign, unpaid, incomplete or live Checkout session",async()=>{
  for(const extra of [{customer:"cus_victim"},{client_reference_id:"victim"},{livemode:true},{payment_status:"unpaid"},{status:"open"}]){
    const old=state.session;state.session={...old,...extra};
    assert.ok([403,409].includes((await verify.POST(request({sessionId:"cs_test_1234567890abc"}))).status));state.session=old;
  }
  assert.equal(state.syncCalls,0);
  assert.equal((await verify.POST(request({sessionId:"cs_test_1234567890abc"}))).status,200);assert.equal(state.syncCalls,1);
});
test("portal uses this business's customer and a fixed return URL; a portal configured for live is rejected in test",async()=>{
  const old=process.env.STRIPE_PORTAL_CONFIGURATION_ID;process.env.STRIPE_PORTAL_CONFIGURATION_ID="bpc_fixture";
  try {
    const response=await portal.POST(request({customer:"cus_victim",return_url:"https://evil.example"}));assert.equal(response.status,200);
    assert.equal(state.portal.customer,"cus_ours");assert.equal(state.portal.return_url,"https://chatbot-ai-gold-two.vercel.app/dashboard/billing");
    state.stripe.billingPortal.configurations.retrieve=async()=>({active:true,livemode:true});
    assert.equal((await portal.POST(request())).status,503);
  } finally {if(old===undefined)delete process.env.STRIPE_PORTAL_CONFIGURATION_ID;else process.env.STRIPE_PORTAL_CONFIGURATION_ID=old;}
});
