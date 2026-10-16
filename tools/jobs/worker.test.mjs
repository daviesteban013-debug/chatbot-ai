import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { moduleUrl } from "../lib/load-module.mjs";

const url = source => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const credits = url("export class CreditError extends Error{constructor(code,message){super(message);this.code=code;}}");
const { runJobsWorker, JobCanceled, JobLeaseLost, publicJobError, MIN_ROUND_MS } = await import(await moduleUrl("lib/jobs/worker.ts", { "@/lib/credits/server": credits }));
const { CreditError } = await import(credits);

const job = (overrides = {}) => ({
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", tenant_id: "11111111-1111-4111-8111-111111111111", user_id: "22222222-2222-4222-8222-222222222222",
  session_id: "session-a", kind: "collections_review", status: "running", input: { file_ids: [], options: { fields: "auto" }, note: "revisa" },
  checkpoint: { page: 2 }, progress: {}, result: null, error: null, request_key: "k", attempts: 0, rounds: 1,
  lease_token: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", lease_until: null, canceled_by: null, created_at: "", updated_at: "", started_at: null, finished_at: null, applied_at: null, ...overrides,
});
let state;
beforeEach(() => { state = { queue: [], calls: [], heartbeat: { ok: true, canceled: false }, finish: { ok: true }, release: { ok: true, status: "queued" } }; });
const admin = {
  rpc(name, args) {
    state.calls.push({ name, args });
    const data = name === "nexo_claim_jobs" ? (state.queue.length ? [state.queue.shift()] : [])
      : name === "nexo_job_heartbeat" ? state.heartbeat : name === "nexo_finish_job" ? { ...state.finish, status: args.p_status } : state.release;
    const result = Promise.resolve({ data, error: state.dbError ?? null });
    return { abortSignal: () => result, then: (resolve, reject) => result.then(resolve, reject) };
  },
};
const names = () => state.calls.map(call => call.name);
const run = (recipe, options = {}) => runJobsWorker(admin, { recipes: { collections_review: recipe }, budgetMs: 45_000, ...options });

test("claims one job at a time while the budget lasts and records each recipe's result", async () => {
  state.queue = [job(), job({ id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" })];
  const seen = [];
  const report = await run(async ctx => {
    seen.push({ id: ctx.job.id, checkpoint: ctx.checkpoint, options: ctx.options, note: ctx.note, account: ctx.account });
    await ctx.heartbeat({ done: 1, total: 3 }, { page: 3 });
    return { kind: "done", result: { summary: "Revisé 3 pedidos" } };
  });
  assert.deepEqual(report, { claimed: 2, done: 2, failed: 0, released: 0, canceled: 0, errors: 0 });
  assert.deepEqual(seen[0].checkpoint, { page: 2 }); assert.deepEqual(seen[0].options, { fields: "auto" }); assert.equal(seen[0].note, "revisa");
  assert.deepEqual(seen[0].account, { tenantId: "11111111-1111-4111-8111-111111111111", userId: "22222222-2222-4222-8222-222222222222", channel: "web" }, "jobs bill token credits, never the chat's message reservation");
  assert.deepEqual(names(), ["nexo_claim_jobs", "nexo_job_heartbeat", "nexo_finish_job", "nexo_claim_jobs", "nexo_job_heartbeat", "nexo_finish_job", "nexo_claim_jobs"]);
  const finish = state.calls[2].args;
  assert.equal(finish.p_lease, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"); assert.equal(finish.p_status, "done"); assert.deepEqual(finish.p_result, { summary: "Revisé 3 pedidos" });
  assert.deepEqual(state.calls[1].args, { p_id: job().id, p_lease: job().lease_token, p_progress: { done: 1, total: 3 }, p_checkpoint: { page: 3 } });
});

test("a recipe that hands back releases the job with its checkpoint and progress", async () => {
  state.queue = [job()];
  const report = await run(async () => ({ kind: "release", checkpoint: { page: 5 }, progress: { done: 500 } }));
  assert.equal(report.released, 1);
  assert.deepEqual(state.calls[1], { name: "nexo_release_job", args: { p_id: job().id, p_lease: job().lease_token, p_checkpoint: { page: 5 }, p_progress: { done: 500 } } });
  state.queue = [job()]; state.calls = []; state.release = { ok: true, status: "failed" };
  assert.equal((await run(async () => ({ kind: "release", checkpoint: {} }))).failed, 1, "the database may turn a tenth hand-back into a failure");
});

test("cancellation reaches the recipe through the heartbeat and nothing else is written", async () => {
  state.queue = [job()]; state.heartbeat = { ok: false, canceled: true, reason: "canceled" };
  let after = false;
  const report = await run(async ctx => { await ctx.heartbeat(); after = true; return { kind: "done", result: {} }; });
  assert.equal(after, false); assert.equal(report.canceled, 1);
  assert.deepEqual(names(), ["nexo_claim_jobs", "nexo_job_heartbeat", "nexo_claim_jobs"]);
  state.queue = [job()]; state.calls = []; state.heartbeat = { ok: true, canceled: false }; state.finish = { ok: false, canceled: true };
  assert.equal((await run(async () => ({ kind: "done", result: {} }))).canceled, 1, "a job canceled during its last step is not reported as done");
});

test("a lost lease or an unreachable database stops the run silently; the job resumes later", async () => {
  state.queue = [job()]; state.heartbeat = { ok: false, reason: "lease_lost" };
  const report = await run(async ctx => { await ctx.heartbeat(); return { kind: "done", result: {} }; });
  assert.equal(report.errors, 1); assert.ok(!names().includes("nexo_finish_job"));
  state.queue = [job()]; state.calls = [];
  const thrown = await run(async () => { throw new JobLeaseLost(); });
  assert.equal(thrown.errors, 1); assert.ok(!names().includes("nexo_finish_job"));
});

test("credit exhaustion and unexpected errors fail the job with a message the owner can read", async () => {
  state.queue = [job()];
  await run(async () => { throw new CreditError("CREDITS_EXHAUSTED", "No tienes suficientes créditos disponibles para esta respuesta."); });
  assert.equal(state.calls[1].args.p_status, "failed"); assert.match(state.calls[1].args.p_error, /^No tienes suficientes créditos/);
  state.queue = [job()]; state.calls = [];
  await run(async () => { throw new Error("ECONNRESET provider-secret-host"); });
  assert.equal(state.calls[1].args.p_status, "failed"); assert.doesNotMatch(state.calls[1].args.p_error, /secret/); assert.match(state.calls[1].args.p_error, /No pude terminar/);
  state.queue = [job()]; state.calls = [];
  await run(async () => { throw new Error("El archivo es muy grande."); });
  assert.equal(state.calls[1].args.p_error, "El archivo es muy grande.");
  assert.equal(publicJobError(new JobCanceled()), "No pude terminar este trabajo. Inténtalo de nuevo o divide el archivo en partes más pequeñas.");
  state.queue = [job({ kind: "sales_report" })]; state.calls = [];
  assert.equal((await run(async () => ({ kind: "done", result: {} }))).errors, 1, "unknown kinds are never run");
  state.queue = [job()]; state.calls = [];
  assert.equal((await runJobsWorker(admin, { recipes: {}, budgetMs: 45_000 })).failed, 1, "a kind without recipe fails cleanly");
  assert.match(state.calls[1].args.p_error, /ya no está disponible/);
});

test("a run cut short hands the job back from its last checkpoint instead of failing it", async () => {
  state.queue = [job()];
  const controller = new AbortController();
  const report = await run(async ctx => { await ctx.heartbeat(undefined, { page: 9 }); controller.abort(); throw new Error("fetch aborted"); }, { signal: controller.signal });
  assert.equal(report.released, 1);
  assert.deepEqual(state.calls.at(-1).args.p_checkpoint, { page: 9 });
});

test("the budget is respected: no claim near the end, malformed claims are not run", async () => {
  let now = 0;
  state.queue = [job()];
  const report = await run(async () => ({ kind: "done", result: {} }), { budgetMs: MIN_ROUND_MS + 1000, now: () => (now += 2000) });
  assert.equal(report.claimed, 0); assert.deepEqual(names(), []);
  state.queue = [{ id: "x", kind: "collections_review" }];
  let ran = false;
  const bad = await run(async () => { ran = true; return { kind: "done", result: {} }; });
  assert.equal(bad.errors, 1); assert.equal(ran, false);
  state.dbError = { message: "down" }; state.calls = [];
  assert.equal((await run(async () => ({ kind: "done", result: {} }))).errors, 1);
});
