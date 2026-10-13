import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { load, moduleUrl } from "../agent/load.mjs";

const tenant = crypto.randomUUID(), otherTenant = crypto.randomUUID(), order = crypto.randomUUID();
const job = { id: crypto.randomUUID(), tenant_id: tenant, lease_token: crypto.randomUUID() };
const token = crypto.randomUUID();
const originalFetch = globalThis.fetch;
let state;
const pending = () => ({ ready: true, tenant_id: tenant, phone: "+573001111111", order_id: order, total: 248000,
  payment_instructions: { link_url: "https://pay.example/accepted-business", transfer_instructions: "Banco de prueba · cuenta ficticia", version: "accepted-version" }, reminder_no: 1 });

globalThis.__followupCredentials = async (_admin, tenantId) => {
  state.sequence.push("credentials"); state.credentialTenants.push(tenantId);
  if (state.credentialError) throw new Error("Private credentials error fixture-secret");
  return state.credentials;
};
globalThis.__followupGraph = () => state.graph;
globalThis.__followupAdmin = () => ({ rpc(name, args) {
  state.rpcs.push({ name, args }); state.sequence.push(name);
  const result = async () => {
    if (state.rpcThrow === name) throw new Error("Private database error fixture-secret");
    if (state.rpcError === name) return { data: null, error: { message: "Private database error fixture-secret" } };
    if (name === "nexo_claim_sales_followups") return { data: state.claims, error: null };
    if (name === "nexo_begin_sales_followup") return { data: state.begin, error: null };
    if (name === "nexo_finish_sales_followup") return { data: { status: state.finishStatus ?? args.p_status }, error: null };
    if (name === "nexo_consume_sales_worker_ticket") {
      const valid = state.validTicket; state.validTicket = false;
      return { data: valid, error: null };
    }
    throw new Error("Unexpected fixture RPC");
  };
  return { abortSignal(signal) { assert.ok(signal instanceof AbortSignal); return result(); } };
} });

const workerUrl = await load("../../lib/whatsapp/sales-followups.ts", {
  "@/lib/supabase/admin": moduleUrl("export const createAdminClient=()=>globalThis.__followupAdmin();"),
  "./credentials": moduleUrl("export const loadWhatsAppSendOptions=(...args)=>globalThis.__followupCredentials(...args);"),
  "./cloud": moduleUrl("export const graphBaseUrl=()=>globalThis.__followupGraph();"),
});
const { runSalesFollowups, salesFollowupBody } = await import(workerUrl);
globalThis.__routeFollowups = async admin => {
  state.workerCalls++;
  if (state.workerError) throw new Error("Private worker error fixture-secret");
  return runSalesFollowups(admin);
};
const { POST, dynamic, runtime, maxDuration } = await import(await load("../../app/api/whatsapp/followups/route.ts", {
  "@/lib/supabase/admin": moduleUrl("export const createAdminClient=()=>globalThis.__followupAdmin();"),
  "@/lib/whatsapp/sales-followups": moduleUrl("export const runSalesFollowups=admin=>globalThis.__routeFollowups(admin);"),
}));

beforeEach(() => {
  state = { claims: [job], begin: pending(), credentials: { phoneNumberId: "123456789", accessToken: "fixture-secret" },
    graph: "https://graph.facebook.com/v26.0", rpcs: [], fetches: [], sequence: [], credentialTenants: [],
    responseStatus: 200, responseBody: { messages: [{ id: "wamid.fixture_accepted" }] }, validTicket: true, workerCalls: 0 };
  globalThis.fetch = async (url, options) => {
    state.sequence.push("fetch"); state.fetches.push({ url, options });
    if (state.fetchError) throw new Error("Private network failure fixture-secret");
    return new Response(state.malformedBody ? "not JSON" : JSON.stringify(state.responseBody), {
      status: state.responseStatus, headers: { "Content-Type": "application/json" },
    });
  };
});
afterEach(() => { globalThis.fetch = originalFetch; });
const run = () => runSalesFollowups(globalThis.__followupAdmin());
const finishes = () => state.rpcs.filter(call => call.name === "nexo_finish_sales_followup");
const req = (body = { token }, extra = {}) => new Request("https://nexo.test/api/whatsapp/followups", {
  method: "POST", headers: { "Content-Type": "application/json", ...extra }, body: typeof body === "string" ? body : JSON.stringify(body),
});

test("one fresh SQL snapshot produces exactly one request and persists sent only after provider acceptance", async () => {
  const result = await run();
  assert.deepEqual(result, { claimed: 1, sent: 1, blocked: 0, failed: 0, unknown: 0, skipped: 0, errors: 0 });
  assert.equal(state.rpcs[0].args.p_limit, 3);
  assert.deepEqual(state.credentialTenants, [tenant]);
  assert.deepEqual(state.sequence, ["nexo_claim_sales_followups", "credentials", "nexo_begin_sales_followup", "fetch", "nexo_finish_sales_followup"]);
  const { url, options } = state.fetches[0];
  assert.equal(url, "https://graph.facebook.com/v26.0/123456789/messages");
  assert.equal(options.redirect, "error"); assert.ok(options.signal instanceof AbortSignal);
  assert.equal(options.headers.Authorization, "Bearer fixture-secret");
  const payload = JSON.parse(options.body);
  assert.equal(payload.to, state.begin.phone); assert.equal(payload.type, "text");
  assert.match(payload.text.body, /\$248\.000 COP/); assert.ok(payload.text.body.includes(order));
  assert.match(payload.text.body, /https:\/\/pay\.example\/accepted-business/);
  assert.match(payload.text.body, /no confirma que el pago esté verificado/);
  assert.match(payload.text.body, /no me escribas más/); assert.doesNotMatch(payload.text.body, /fixture-secret/);
  assert.deepEqual(finishes()[0].args, { p_id: job.id, p_lease: job.lease_token, p_status: "sent", p_reason: null,
    p_wa_message_id: "wamid.fixture_accepted", p_body: payload.text.body });
});

test("canceled or blocked SQL revalidation never contacts Meta or fabricates a sent message", async () => {
  for (const reason of ["payment_not_pending", "new_customer_message", "service_window_closed", "conversation_handoff", "disabled", "customer_opted_out"]) {
    state.begin = { ready: false, reason };
    const result = await run(); assert.equal(result.skipped, 1); assert.equal(result.sent, 0);
  }
  assert.equal(state.fetches.length, 0); assert.equal(finishes().length, 0);
});

test("missing or failed credentials are blocked before begin and before any network request", async () => {
  state.credentials = null;
  let result = await run(); assert.equal(result.blocked, 1);
  assert.equal(finishes()[0].args.p_reason, "credentials_unavailable");
  state.credentialError = true; result = await run(); assert.equal(result.blocked, 1);
  assert.ok(!state.rpcs.some(call => call.name === "nexo_begin_sales_followup"));
  assert.equal(state.fetches.length, 0);
});

test("invalid or foreign snapshots, arbitrary endpoints and oversized messages never send", async () => {
  const cases = [
    { ...pending(), tenant_id: otherTenant }, { ...pending(), phone: "not-a-number" },
    { ...pending(), total: "248000" }, { ...pending(), total: -1 },
    { ...pending(), payment_instructions: { ...pending().payment_instructions, link_url: "https://user:secret@evil.example" } },
    { ...pending(), payment_instructions: { ...pending().payment_instructions, link_url: "http://pay.example" } },
    { ...pending(), payment_instructions: { link_url: null, transfer_instructions: null } },
  ];
  for (const value of cases) { state.begin = value; assert.equal((await run()).blocked, 1); }
  state.begin = pending(); state.graph = "https://evil.example/v26.0"; assert.equal((await run()).blocked, 1);
  state.graph = "https://graph.facebook.com/v26.0";
  state.begin.payment_instructions = { link_url: `https://pay.example/${"x".repeat(2000)}`, transfer_instructions: "y".repeat(1990), version: "v" };
  assert.equal((await run()).blocked, 1); assert.equal(finishes().at(-1).args.p_reason, "message_too_long");
  assert.equal(state.fetches.length, 0);
});

test("provider 5xx and network or timeout ambiguity become unknown without a retry", async () => {
  for (const status of [500, 502, 503]) {
    state.responseStatus = status; const before = state.fetches.length;
    const result = await run(); assert.equal(result.unknown, 1); assert.equal(result.sent, 0);
    assert.equal(state.fetches.length, before + 1); assert.equal(finishes().at(-1).args.p_status, "unknown");
  }
  state.fetchError = true; const before = state.fetches.length;
  assert.equal((await run()).unknown, 1); assert.equal(state.fetches.length, before + 1);
  assert.equal(finishes().at(-1).args.p_reason, "delivery_uncertain");
});

test("4xx rejection and rate limiting are failed with safe reasons and no provider body", async () => {
  state.responseBody = { error: { message: "private fixture-secret", code: 190 } };
  for (const status of [400, 401, 403, 429]) {
    state.responseStatus = status; const before = state.fetches.length;
    const result = await run(); assert.equal(result.failed, 1); assert.equal(state.fetches.length, before + 1);
    assert.equal(finishes().at(-1).args.p_reason, status === 429 ? "rate_limited" : "provider_rejected");
    assert.equal(finishes().at(-1).args.p_body, null); assert.equal(finishes().at(-1).args.p_wa_message_id, null);
    assert.ok(!JSON.stringify(result).includes("fixture-secret"));
  }
});

test("malformed accepted responses stay unknown and do not create outbound proof", async () => {
  for (const body of [{}, { messages: [] }, { messages: [{ id: "arbitrary" }] }, { messages: [{ id: "wamid.one" }, { id: "wamid.two" }] }]) {
    state.responseBody = body; assert.equal((await run()).unknown, 1);
    assert.equal(finishes().at(-1).args.p_reason, "provider_response_invalid");
    assert.equal(finishes().at(-1).args.p_body, null);
  }
  state.malformedBody = true; assert.equal((await run()).unknown, 1);
  assert.equal(state.fetches.length, 5);
});

test("database failures before delivery do not send; after acceptance remain unknown without replay", async () => {
  state.rpcError = "nexo_begin_sales_followup";
  let result = await run(); assert.equal(result.errors, 1); assert.equal(state.fetches.length, 0);
  state.rpcError = "nexo_finish_sales_followup";
  result = await run(); assert.equal(result.errors, 1); assert.equal(result.unknown, 1); assert.equal(result.sent, 0);
  assert.equal(state.fetches.length, 1); assert.equal(finishes().length, 1);
  state.rpcError = null; state.finishStatus = "canceled";
  result = await run(); assert.equal(result.errors, 1); assert.equal(result.unknown, 1); assert.equal(result.sent, 0);
});

test("empty claims do nothing; malformed, duplicate or oversized claims fail safely", async () => {
  state.claims = []; assert.equal((await run()).claimed, 0); assert.equal(state.fetches.length, 0);
  for (const value of [null, {}, [{ ...job, tenant_id: "bad" }], [job, job], Array.from({ length: 4 }, () => ({ ...job, id: crypto.randomUUID() }))]) {
    state.claims = value; await assert.rejects(run, /NEXO_FOLLOWUPS_UNAVAILABLE/);
  }
  state.rpcThrow = "nexo_claim_sales_followups";
  await assert.rejects(run, error => error.message === "NEXO_FOLLOWUPS_UNAVAILABLE");
  assert.equal(state.fetches.length, 0);
});

test("bounded batch processes at most three jobs independently", async () => {
  state.claims = Array.from({ length: 3 }, () => ({ ...job, id: crypto.randomUUID(), lease_token: crypto.randomUUID() }));
  const result = await run(); assert.equal(result.claimed, 3); assert.equal(result.sent, 3); assert.equal(state.fetches.length, 3);
});

test("deterministic text has no imaginary completed payment or shipment and refuses silent truncation", () => {
  const text = salesFollowupBody(pending());
  assert.match(text, /pendiente de verificación/); assert.doesNotMatch(text, /pedido despachado|pago recibido|pago confirmado/i);
  const long = pending(); long.payment_instructions.transfer_instructions = "x".repeat(4100);
  assert.throws(() => salesFollowupBody(long), /NEXO_FOLLOWUP_BODY_TOO_LONG/);
});

test("worker route requires a strict bounded JSON ticket before querying privileged state", async () => {
  assert.equal(dynamic, "force-dynamic"); assert.equal(runtime, "nodejs"); assert.equal(maxDuration, 60);
  for (const input of [{}, { token: "wrong" }, { token, tenant_id: tenant }, [token], null, "not-json"]) {
    assert.equal((await POST(req(input))).status, 400);
  }
  assert.equal((await POST(req({ token }, { "Content-Type": "text/plain" }))).status, 415);
  assert.equal((await POST(req({ token }, { "content-length": "9000" }))).status, 413);
  assert.equal((await POST(req("x".repeat(257)))).status, 413);
  assert.equal((await POST(req("é".repeat(130)))).status, 413);
  assert.equal(state.rpcs.length, 0); assert.equal(state.workerCalls, 0); assert.equal(state.fetches.length, 0);
});

test("invalid or reused tickets return 401 and cannot start work twice", async () => {
  state.claims = [];
  const response = await POST(req()); assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(state.rpcs[0].name, "nexo_consume_sales_worker_ticket"); assert.deepEqual(state.rpcs[0].args, { p_token: token });
  assert.equal(state.workerCalls, 1);
  const again = await POST(req()); assert.equal(again.status, 401); assert.equal(state.workerCalls, 1); assert.equal(state.fetches.length, 0);
});

test("route hides database/provider details and never returns worker tickets or secrets", async () => {
  state.rpcError = "nexo_consume_sales_worker_ticket";
  let response = await POST(req()); assert.equal(response.status, 503); assert.equal(state.workerCalls, 0);
  assert.doesNotMatch(await response.text(), /fixture-secret|Private|token/);
  state.rpcError = null; state.workerError = true;
  response = await POST(req()); assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /fixture-secret|Private|token/);
  assert.equal(state.fetches.length, 0);
});
