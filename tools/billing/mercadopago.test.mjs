import assert from "node:assert/strict";
import crypto from "node:crypto";
import { beforeEach, test } from "node:test";
import { moduleUrl } from "../lib/load-module.mjs";

const url = source => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
let state;
globalThis.__billingState = () => state;
process.env.APP_URL = "https://nexo.test";
process.env.MERCADOPAGO_ACCESS_TOKEN = "APP_USR-test-token";
process.env.MERCADOPAGO_WEBHOOK_SECRET = "webhook-secret";
process.env.MERCADOPAGO_MODE = "test";

const checkoutId = "5f0c6a1e-2b7d-4c3a-9e8f-1a2b3c4d5e6f";
const admin = url(`export function createAdminClient(){const s=globalThis.__billingState();return {
  async rpc(name,args){s.rpcs.push({name,args});return s.rpc[name] ?? {data:{ok:true,applied:true},error:null};},
  from(table){const q={filters:{},select(){return q;},eq(k,v){q.filters[k]=v;return q;},
    update(values){s.updates.push({table,values,filters:q.filters});return q;},
    async maybeSingle(){return table==="tenants"?{data:s.tenantRow,error:null}:{data:s.checkout,error:null};},
    then(resolve){return Promise.resolve({error:s.updateError??null}).then(resolve);}};return q;}};}`);
const next = url("export const NextResponse = {json:(data,options)=>Response.json(data,options)};");
const auth = url("export const getCurrentUser=async()=>globalThis.__billingState().user; export const getCurrentTenant=async()=>globalThis.__billingState().tenant;");
const fakeBilling = url(`const s=()=>globalThis.__billingState();
  export class BillingError extends Error{constructor(status,message){super(message);this.status=status;}}
  export async function createCheckout(input){s().created=input;return s().checkoutResult;}
  export async function applyPayment(id,tenant){s().applied={id,tenant};if(s().fail)throw s().fail;return s().applyResult??{ok:true};}
  export async function applyAuthorizedPayment(id){s().authorized=id;return {ok:true};}
  export async function syncPreapproval(id,tenant){s().synced={id,tenant};return {ok:true};}
  export async function cancelSubscription(tenant){s().canceled=tenant;}`);

const { verifyMercadoPagoSignature } = await import(await moduleUrl("lib/mercadopago/verify.ts", { "node:crypto": "node:crypto" }));
const billing = await import(await moduleUrl("lib/mercadopago/billing.ts", { "@/lib/supabase/admin": admin }));
const checkoutRoute = await import(await moduleUrl("app/api/billing/checkout/route.ts", { "next/server": next, "@/lib/auth": auth, "@/lib/mercadopago/billing": fakeBilling }));
const verifyRoute = await import(await moduleUrl("app/api/billing/verify/route.ts", { "next/server": next, "@/lib/auth": auth, "@/lib/mercadopago/billing": fakeBilling }));
const webhook = await import(await moduleUrl("app/api/mercadopago/webhook/route.ts", { "node:crypto": "node:crypto", "next/server": next, "@/lib/mercadopago/billing": fakeBilling }));

const responses = new Map();
globalThis.fetch = async (input, init = {}) => {
  const path = new URL(String(input)).pathname;
  state.calls.push({ path, method: init.method ?? "GET", body: init.body ? JSON.parse(init.body) : undefined, headers: init.headers });
  const body = responses.get(path);
  if (body === undefined) return new Response("{}", { status: 404 });
  return Response.json(body);
};
beforeEach(() => {
  responses.clear();
  state = { user: { id: "user-1", email: "dueno@tienda.co" }, tenant: { tenantId: "tenant-1", role: "owner" }, rpcs: [], updates: [], calls: [],
    rpc: {}, checkout: { id: checkoutId, tenant_id: "tenant-1", kind: "one_time" }, checkoutResult: { ok: true, url: "https://www.mercadopago.com.co/checkout/v1/redirect?pref_id=1" } };
});

const sign = (dataId, requestId = "req-1", ts = "1704908010", secret = "webhook-secret") =>
  `ts=${ts},v1=${crypto.createHmac("sha256", secret).update(`id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`).digest("hex")}`;
const post = (path, body, origin = "https://nexo.test") => new Request(`https://nexo.test${path}`, { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });

test("webhook signatures follow Mercado Pago's manifest, lowercase ids and reject tampering", () => {
  const ok = { signature: sign("ORD01ABC"), requestId: "req-1", dataId: "ORD01ABC", secret: "webhook-secret" };
  assert.equal(verifyMercadoPagoSignature(ok), true);
  assert.equal(verifyMercadoPagoSignature({ ...ok, dataId: "other" }), false);
  assert.equal(verifyMercadoPagoSignature({ ...ok, requestId: "req-2" }), false);
  assert.equal(verifyMercadoPagoSignature({ ...ok, secret: "wrong" }), false);
  assert.equal(verifyMercadoPagoSignature({ ...ok, signature: "ts=1,v1=zz" }), false);
  assert.equal(verifyMercadoPagoSignature({ ...ok, signature: null }), false);
});

test("checkout is owner-only and same-origin; plan, amount and business come from the server", async () => {
  state.user = null; assert.equal((await checkoutRoute.POST(post("/api/billing/checkout", {}))).status, 401);
  state.user = { id: "user-1", email: "dueno@tienda.co" }; state.tenant.role = "viewer";
  assert.equal((await checkoutRoute.POST(post("/api/billing/checkout", {}))).status, 403);
  state.tenant.role = "owner";
  assert.equal((await checkoutRoute.POST(post("/api/billing/checkout", { planId: "esencial", annual: false, kind: "one_time" }, "https://evil.test"))).status, 403);
  assert.equal((await checkoutRoute.POST(post("/api/billing/checkout", { planId: "gratis", annual: false, kind: "one_time" }))).status, 400);
  assert.equal((await checkoutRoute.POST(post("/api/billing/checkout", { planId: "esencial", annual: false, kind: "free" }))).status, 400);
  assert.equal(state.created, undefined);
  const response = await checkoutRoute.POST(post("/api/billing/checkout", { planId: "crecimiento", annual: true, kind: "subscription", amount: 1, tenantId: "foreign" }));
  assert.equal(response.status, 200);
  assert.equal(state.created.tenantId, "tenant-1"); assert.equal(state.created.plan.id, "crecimiento");
  assert.equal(state.created.email, "dueno@tienda.co"); assert.equal(state.created.kind, "subscription");
  state.checkoutResult = { ok: false, reason: "subscribed" };
  assert.equal((await checkoutRoute.POST(post("/api/billing/checkout", { planId: "esencial", annual: false, kind: "one_time" }))).status, 409);
});

test("one-time checkout charges the plan's COP total and only returns Mercado Pago URLs", async () => {
  state.rpc.nexo_claim_mp_checkout = { data: { ok: true, id: checkoutId, reused: false, expiresAt: "2026-10-17T12:00:00Z" }, error: null };
  responses.set("/checkout/preferences", { id: "pref-1", init_point: "https://www.mercadopago.com.co/checkout/v1/redirect?pref_id=pref-1" });
  const plan = { id: "esencial", name: "Esencial", price: 120000 };
  const result = await billing.createCheckout({ tenantId: "tenant-1", userId: "user-1", email: "dueno@tienda.co", plan, annual: true, kind: "one_time" });
  assert.equal(result.ok, true);
  assert.equal(state.rpcs[0].args.p_amount, 1152000);
  const sent = state.calls[0].body;
  assert.equal(sent.items[0].unit_price, 1152000); assert.equal(sent.items[0].currency_id, "COP");
  assert.equal(sent.external_reference, checkoutId);
  assert.equal(state.calls[0].headers["X-Idempotency-Key"], `nexo-pref-${checkoutId}`);
  assert.deepEqual(state.updates[0].values, { mp_ref: "pref-1", checkout_url: "https://www.mercadopago.com.co/checkout/v1/redirect?pref_id=pref-1" });
  responses.set("/checkout/preferences", { id: "pref-2", init_point: "https://evil.test/pay" });
  await assert.rejects(billing.createCheckout({ tenantId: "tenant-1", userId: "user-1", email: "a@b.co", plan, annual: false, kind: "one_time" }), /enlace de pago válido/);
});

test("automatic subscriptions recur monthly or yearly in COP for the owner's email", async () => {
  state.rpc.nexo_claim_mp_checkout = { data: { ok: true, id: checkoutId, reused: false }, error: null };
  responses.set("/preapproval", { id: "pre-1", status: "pending", init_point: "https://www.mercadopago.com.co/subscriptions/checkout?preapproval_id=pre-1" });
  await billing.createCheckout({ tenantId: "tenant-1", userId: "user-1", email: "dueno@tienda.co", plan: { id: "equipo", name: "Equipo", price: 400000 }, annual: false, kind: "subscription" });
  const sent = state.calls[0].body;
  assert.deepEqual(sent.auto_recurring, { frequency: 1, frequency_type: "months", transaction_amount: 400000, currency_id: "COP" });
  assert.equal(sent.payer_email, "dueno@tienda.co"); assert.equal(sent.status, "pending"); assert.equal(sent.external_reference, checkoutId);
});

test("payments are re-read from Mercado Pago; foreign references, other businesses and other modes never apply", async () => {
  responses.set("/v1/payments/123", { id: 123, status: "approved", transaction_amount: 120000, currency_id: "COP", external_reference: checkoutId, live_mode: false });
  await billing.applyPayment("123");
  assert.deepEqual(state.rpcs[0], { name: "nexo_apply_mp_payment", args: { p_payment_id: "123", p_checkout: checkoutId, p_mode: "test", p_status: "approved", p_amount: 120000, p_currency: "COP", p_raw: { status_detail: null, payment_type_id: null, payment_method_id: null, date_approved: null } } });
  await assert.rejects(billing.applyPayment("123", "tenant-2"), /no pertenece/);
  responses.set("/v1/payments/124", { id: 124, status: "approved", transaction_amount: 120000, currency_id: "COP", external_reference: "pedido-tienda-77" });
  assert.equal((await billing.applyPayment("124")).reason, "foreign");
  responses.set("/v1/payments/125", { id: 125, status: "approved", transaction_amount: 120000, currency_id: "COP", external_reference: checkoutId, live_mode: true });
  assert.equal((await billing.applyPayment("125")).reason, "mode");
  assert.equal(state.rpcs.length, 1);
  await assert.rejects(billing.applyPayment("../v1/x"), /inválido/);
});

test("the return page verifies through the server for this business only", async () => {
  state.tenant.role = "agent"; assert.equal((await verifyRoute.POST(post("/api/billing/verify", { paymentId: "1" }))).status, 403);
  state.tenant.role = "owner"; assert.equal((await verifyRoute.POST(post("/api/billing/verify", { paymentId: "../x" }))).status, 400);
  assert.equal((await verifyRoute.POST(post("/api/billing/verify", { paymentId: "55" }))).status, 200);
  assert.deepEqual(state.applied, { id: "55", tenant: "tenant-1" });
  state.applyResult = { ok: false, reason: "foreign" };
  assert.equal((await verifyRoute.POST(post("/api/billing/verify", { paymentId: "56" }))).status, 404);
});

test("webhook trusts only the signed URL id, ignores unknown topics and asks for a retry on failure", async () => {
  const hook = (id, type, body = { type, data: { id } }, signature = sign(id)) => new Request(`https://nexo.test/api/mercadopago/webhook?data.id=${id}&type=${type}`, {
    method: "POST", headers: { "x-signature": signature, "x-request-id": "req-1", "content-type": "application/json" }, body: JSON.stringify(body) });
  assert.equal((await webhook.POST(hook("77", "payment", undefined, sign("78")))).status, 401);
  assert.equal(state.applied, undefined);
  const response = await webhook.POST(hook("77", "payment", { type: "payment", data: { id: "999" } }));
  assert.equal(response.status, 200); assert.deepEqual(state.applied, { id: "77", tenant: undefined });
  assert.equal((await webhook.POST(hook("88", "subscription_authorized_payment"))).status, 200); assert.equal(state.authorized, "88");
  assert.equal((await webhook.POST(hook("pre-9", "subscription_preapproval"))).status, 200); assert.equal(state.synced.id, "pre-9");
  assert.equal((await webhook.POST(hook("90", "merchant_order"))).status, 200);
  state.fail = new Error("db down");
  assert.equal((await webhook.POST(hook("91", "payment"))).status, 500);
  delete process.env.MERCADOPAGO_WEBHOOK_SECRET;
  try { assert.equal((await webhook.POST(hook("92", "payment"))).status, 503); }
  finally { process.env.MERCADOPAGO_WEBHOOK_SECRET = "webhook-secret"; }
});
