import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { moduleUrl } from "../lib/load-module.mjs";

const url = source => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
let state;
globalThis.__jobRouteState = () => state;
const tenant = "11111111-1111-4111-8111-111111111111";
const jobId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const row = (overrides = {}) => ({ id: jobId, tenant_id: tenant, user_id: "user-1", session_id: "session-a", kind: "collections_review", status: "queued", input: { note: "hola" }, checkpoint: {}, progress: {},
  result: null, error: null, request_key: "k", attempts: 0, rounds: 0, lease_token: null, lease_until: null, canceled_by: null, created_at: "2026-10-16T00:00:00Z", updated_at: "", started_at: null, finished_at: null, applied_at: null, ...overrides });
beforeEach(() => { state = { user: { id: "user-1" }, tenant: { tenantId: tenant, role: "owner" }, rpc: [], rows: [row()], sessions: [{ session_id: "session-a" }], rpcResult: {}, worker: [] }; });

const admin = url(`export function createAdminClient(){const s=globalThis.__jobRouteState();
  const table=name=>{const q={select(){return q},eq(){return q},in(){return q},order(){return q},limit(){return q},
    maybeSingle:async()=>({data:(name==='jarvis_sessions'?s.sessions:s.rows)[0]??null,error:null}),then(a,b){return Promise.resolve({data:name==='jarvis_sessions'?s.sessions:s.rows,error:null}).then(a,b)}};return q;};
  return {from:table,rpc(name,args){s.rpc.push({name,args});const r=s.rpcResult[name]??{data:null,error:null};const p=Promise.resolve(typeof r==='function'?r(args):r);return {abortSignal:()=>p,then:(a,b)=>p.then(a,b)};}};}`);
const server = url("export const jobsTeam=async()=>{const s=globalThis.__jobRouteState();return s.user&&s.tenant?{user:s.user,tenant:s.tenant}:null;}; export const startErrors={JOB_LIMIT:[429,'NEXO ya tiene dos trabajos en curso.'],JOB_FILES:[400,'Adjunta el archivo correcto.'],JOB_FORBIDDEN:[403,'Tu rol no permite iniciar trabajos.'],JOB_INPUT:[400,'La solicitud no es válida.']};");
const nextServer = url("export const NextResponse={json:(d,o)=>Response.json(d,o)};");
const list = await import(await moduleUrl("app/api/jarvis/jobs/route.ts", { "next/server": nextServer, "@/lib/supabase/admin": admin, "@/lib/jobs/server": server }));
const detail = await import(await moduleUrl("app/api/jarvis/jobs/[id]/route.ts", { "next/server": nextServer, "@/lib/supabase/admin": admin, "@/lib/jobs/server": server }));
const worker = await import(await moduleUrl("app/api/jarvis/jobs/worker/route.ts", { "@/lib/supabase/admin": admin,
  "@/lib/jobs/worker": url("export async function runJobsWorker(admin,options){globalThis.__jobRouteState().worker.push(options);return {claimed:1,done:1,failed:0,released:0,canceled:0,errors:0};}"),
  "@/lib/jobs/recipes": url("export const recipes={collections_review:async()=>({kind:'done',result:{}})};") }));
const request = (path, { method = "GET", body, origin = "https://nexo.test", headers = {} } = {}) => Object.assign(new Request(`https://nexo.test${path}`, {
  method, headers: { origin, "content-type": "application/json", ...headers }, ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }) }), { nextUrl: new URL(`https://nexo.test${path}`) });
const params = { params: Promise.resolve({ id: jobId }) };

test("the worker route accepts only a one-time ticket in a tiny JSON body", async () => {
  const post = (body, headers = {}) => worker.POST(new Request("https://nexo.test/api/jarvis/jobs/worker", { method: "POST", headers: { "content-type": "application/json", ...headers }, body }));
  assert.equal((await worker.POST(new Request("https://nexo.test/api/jarvis/jobs/worker", { method: "POST", body: "{}" }))).status, 415);
  assert.equal((await post("x".repeat(300))).status, 413);
  assert.equal((await post(JSON.stringify({ token: "nope" }))).status, 400);
  assert.equal((await post(JSON.stringify({ token: jobId, extra: 1 }))).status, 400);
  state.rpcResult.nexo_consume_worker_ticket = { data: false, error: null };
  assert.equal((await post(JSON.stringify({ token: jobId }))).status, 401);
  assert.equal(state.worker.length, 0);
  state.rpcResult.nexo_consume_worker_ticket = { data: true, error: null };
  const response = await post(JSON.stringify({ token: jobId }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, claimed: 1, done: 1, failed: 0, released: 0, canceled: 0, errors: 0 });
  assert.deepEqual(state.rpc.at(-1).args, { p_token: jobId, p_worker: "jobs" });
  assert.equal(state.worker[0].budgetMs, 45_000); assert.ok(state.worker[0].recipes.collections_review);
  state.rpcResult.nexo_consume_worker_ticket = { data: null, error: { message: "down" } };
  assert.equal((await post(JSON.stringify({ token: jobId }))).status, 503);
});

test("listing is for owners and agents of the business; viewers get an empty list", async () => {
  const response = await list.GET(request("/api/jarvis/jobs?mine=1"));
  assert.equal(response.status, 200);
  const { jobs } = await response.json();
  assert.deepEqual(jobs.map(job => [job.id, job.kind, job.status, job.note, job.progress]), [[jobId, "collections_review", "queued", "hola", {}]]);
  assert.equal(jobs[0].input, undefined, "raw input and checkpoints never leave the server");
  state.tenant.role = "viewer";
  assert.deepEqual(await (await list.GET(request("/api/jarvis/jobs"))).json(), { jobs: [] });
  state.user = null;
  assert.equal((await list.GET(request("/api/jarvis/jobs"))).status, 401);
});

test("starting from the interface is same-origin, validated, scoped to the caller's conversation and idempotent by key", async () => {
  const body = { kind: "catalog_update", file_ids: [jobId], session_id: "session-a", options: { stock_mode: "add" }, request_key: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" };
  assert.equal((await list.POST(request("/api/jarvis/jobs", { method: "POST", body, origin: "https://evil.test" }))).status, 403);
  assert.equal((await list.POST(request("/api/jarvis/jobs", { method: "POST", body: { ...body, kind: "nope" } }))).status, 400);
  assert.equal((await list.POST(request("/api/jarvis/jobs", { method: "POST", body: { ...body, options: { mode: "merge" } } }))).status, 400, "options must match the kind");
  state.tenant.role = "viewer";
  assert.equal((await list.POST(request("/api/jarvis/jobs", { method: "POST", body }))).status, 403);
  state.tenant.role = "agent"; state.sessions = [];
  assert.equal((await list.POST(request("/api/jarvis/jobs", { method: "POST", body }))).status, 403, "someone else's conversation");
  state.sessions = [{ session_id: "session-a" }];
  state.rpcResult.nexo_start_job = args => ({ data: { ...row({ kind: args.p_kind, input: args.p_input }), existing: false }, error: null });
  const created = await list.POST(request("/api/jarvis/jobs", { method: "POST", body }));
  assert.equal(created.status, 201);
  const call = state.rpc.find(item => item.name === "nexo_start_job").args;
  assert.deepEqual(call, { p_tenant: tenant, p_user: "user-1", p_session: "session-a", p_kind: "catalog_update", p_input: { file_ids: [jobId], options: { stock_mode: "add", fields: "auto" } }, p_key: "ui:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" });
  assert.equal((await created.json()).job.kind, "catalog_update");
  state.rpcResult.nexo_start_job = { data: null, error: { message: "JOB_LIMIT" } };
  const limited = await list.POST(request("/api/jarvis/jobs", { method: "POST", body }));
  assert.equal(limited.status, 429); assert.match((await limited.json()).error, /dos trabajos/);
});

test("the detail returns the result only when done; cancel and apply are deliberate same-origin clicks", async () => {
  const done = row({ kind: "catalog_import", status: "done", result: { summary: "ok", mode: "only_new", drafts: [
    { name: "Gorra", sku: null, description: null, category: "Gorras", price_retail: 35000, price_wholesale: null, wholesale_min_qty: null, image_url: null, variants: [{ sku: null, color: "Negro", size: null, stock_qty: 3, price_override: null }], warnings: [] },
    { name: "Sin precio", sku: null, description: null, category: null, price_retail: null, price_wholesale: null, wholesale_min_qty: null, image_url: null, variants: [], warnings: ["Falta el precio"] },
  ] } });
  state.rows = [done];
  const shown = await (await detail.GET(request(`/api/jarvis/jobs/${jobId}`), params)).json();
  assert.equal(shown.job.summary, "ok"); assert.equal(shown.result.drafts.length, 2);
  state.rows = [row()];
  assert.equal((await (await detail.GET(request(`/api/jarvis/jobs/${jobId}`), params)).json()).result, null);
  state.rows = [];
  assert.equal((await detail.GET(request(`/api/jarvis/jobs/${jobId}`), params)).status, 404);
  assert.equal((await detail.GET(request("/api/jarvis/jobs/x"), { params: Promise.resolve({ id: "x" }) })).status, 400);

  assert.equal((await detail.POST(request(`/api/jarvis/jobs/${jobId}`, { method: "POST", body: { action: "cancel" }, origin: "https://evil.test" }), params)).status, 403);
  state.rpcResult.nexo_cancel_job = { data: row({ status: "canceled" }), error: null };
  const canceled = await detail.POST(request(`/api/jarvis/jobs/${jobId}`, { method: "POST", body: { action: "cancel" } }), params);
  assert.equal((await canceled.json()).job.status, "canceled");
  assert.deepEqual(state.rpc.at(-1).args, { p_tenant: tenant, p_user: "user-1", p_id: jobId });

  state.rows = [row()];
  assert.equal((await detail.POST(request(`/api/jarvis/jobs/${jobId}`, { method: "POST", body: { action: "apply" } }), params)).status, 409, "only finished imports apply");
  state.rows = [done];
  state.rpcResult.nexo_import_products = { data: { created: 1, updated: 0, skipped: 0, results: [{ index: 0, status: "created" }] }, error: null };
  state.rpcResult.nexo_mark_job_applied = args => ({ data: { ...done, applied_at: "2026-10-16T01:00:00Z", result: { ...done.result, applied: args.p_outcome } }, error: null });
  const applied = await detail.POST(request(`/api/jarvis/jobs/${jobId}`, { method: "POST", body: { action: "apply" } }), params);
  assert.equal(applied.status, 200);
  const imported = state.rpc.find(item => item.name === "nexo_import_products").args;
  assert.equal(imported.p_mode, "only_new", "the mode chosen when the job was started");
  assert.deepEqual(imported.p_products, [{ name: "Gorra", category: "Gorras", price_retail: 35000, variants: [{ color: "Negro", stock_qty: 3 }] }], "drafts without price are not sent; empty fields are omitted");
  const outcome = state.rpc.find(item => item.name === "nexo_mark_job_applied").args.p_outcome;
  assert.deepEqual(outcome, { mode: "only_new", created: 1, updated: 0, skipped: 1, missing_price: 1, results: [{ index: 0, status: "created" }] });
  assert.equal((await applied.json()).job.applied_at, "2026-10-16T01:00:00Z");
  state.rows = [{ ...done, applied_at: "2026-10-16T01:00:00Z" }];
  assert.equal((await detail.POST(request(`/api/jarvis/jobs/${jobId}`, { method: "POST", body: { action: "apply" } }), params)).status, 409, "never twice");
  state.rows = [done];
  assert.equal((await detail.POST(request(`/api/jarvis/jobs/${jobId}`, { method: "POST", body: { action: "apply", selected: [1] } }), params)).status, 400, "selecting only priceless drafts is refused");
});
