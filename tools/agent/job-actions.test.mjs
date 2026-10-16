import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { moduleUrl } from "../lib/load-module.mjs";

const { createJobStarter } = await import(await moduleUrl("lib/agent/job-actions.ts"));
const xlsx = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const pdf = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const files = [{ id: xlsx, name: "stock.xlsx" }, { id: pdf, name: "catalogo.pdf" }];
let state;
beforeEach(() => { state = { rpc: [], error: null, row: null }; });
const supabase = { rpc(name, args) {
  state.rpc.push({ name, args });
  // Like the database: the same request key always returns the same job.
  state.ids ??= new Map();
  if (!state.ids.has(args.p_key)) state.ids.set(args.p_key, `cccccccc-cccc-4ccc-8ccc-${String(state.ids.size + 1).padStart(12, "0")}`);
  const row = state.row ?? { id: state.ids.get(args.p_key), kind: args.p_kind, status: "queued", session_id: args.p_session, input: args.p_input, checkpoint: {}, progress: {}, result: null, error: null, created_at: "2026-10-16T00:00:00Z", started_at: null, finished_at: null, applied_at: null, existing: false };
  const result = Promise.resolve({ data: state.error ? null : row, error: state.error });
  return { abortSignal: () => result };
} };
const starter = (role = "owner") => createJobStarter({ supabase, tenantId: "tenant-1", role, userId: "user-1", sessionId: "session-a", files });

test("only owners and agents with a conversation get the tool", () => {
  assert.equal(starter("viewer").tools.length, 0);
  assert.equal(createJobStarter({ supabase, tenantId: "", role: "owner", userId: "user-1", sessionId: "s", files }).tools.length, 0);
  assert.deepEqual(starter().tools.map(tool => tool.function.name), ["start_background_job"]);
  assert.match(starter().tools[0].function.description, /started=true solo significa que empezó/);
});

test("attachments must belong to this conversation and fit the recipe", async () => {
  const { execute } = starter();
  assert.match((await execute({ kind: "catalog_update", attachment_ids: ["dddddddd-dddd-4ddd-8ddd-dddddddddddd"] })).error, /adjuntos de esta conversación/);
  assert.match((await execute({ kind: "catalog_update", attachment_ids: [pdf] })).error, /hoja XLSX o CSV/);
  assert.match((await execute({ kind: "catalog_import" })).error, /de uno a tres archivos/);
  assert.match((await execute({ kind: "collections_review", attachment_ids: [pdf] })).error, /no usa archivos/);
  assert.match((await execute({ kind: "catalog_update", attachment_ids: [xlsx], options: { mode: "merge" } })).error, /opciones no son válidas/);
  assert.match((await execute({ kind: "sales_report" })).error, /Indica el tipo/);
  assert.equal(state.rpc.length, 0);
  assert.match((await starter("viewer").execute({ kind: "collections_review" })).error, /Tu rol/);
});

test("starting is idempotent within the turn and the model only learns that the job began", async () => {
  const { execute, jobs } = starter();
  const first = await execute({ kind: "catalog_update", attachment_ids: [xlsx], note: "actualiza el stock", options: { stock_mode: "add" } });
  assert.equal(first.ok, true);
  assert.deepEqual(first.data.job, { id: "cccccccc-cccc-4ccc-8ccc-000000000001", kind: "catalog_update", label: "Actualizar stock o precios desde archivo", status: "queued" });
  assert.equal(first.data.started, true); assert.equal(first.data.finished, false); assert.equal(first.data.results_available, false);
  assert.match(first.data.note, /No anticipes resultados/);
  const call = state.rpc[0];
  assert.equal(call.name, "nexo_start_job");
  assert.deepEqual(call.args.p_input, { file_ids: [xlsx], note: "actualiza el stock", options: { stock_mode: "add", fields: "auto" } });
  assert.match(call.args.p_key, /^chat:[0-9a-f-]{36}$/);
  assert.equal(call.args.p_session, "session-a"); assert.equal(call.args.p_user, "user-1");
  await execute({ kind: "catalog_update", attachment_ids: [xlsx], note: "otra nota", options: { stock_mode: "add" } });
  assert.equal(state.rpc[1].args.p_key, call.args.p_key, "same request in the same turn reuses its key");
  await execute({ kind: "collections_review" });
  assert.notEqual(state.rpc[2].args.p_key, call.args.p_key);
  assert.deepEqual(jobs.map(job => job.kind), ["catalog_update", "collections_review"]);
});

test("database refusals become guidance, and an unverifiable reply never claims a start", async () => {
  const { execute, jobs } = starter();
  state.error = { message: "JOB_LIMIT" };
  assert.match((await execute({ kind: "collections_review" })).error, /dos trabajos en curso/);
  state.error = { message: "JOB_FILES" };
  assert.match((await execute({ kind: "catalog_import", attachment_ids: [pdf] })).error, /hoja XLSX o CSV/);
  state.error = { message: "connection reset by peer" };
  const generic = await execute({ kind: "collections_review" });
  assert.doesNotMatch(generic.error, /peer/); assert.match(generic.error, /No se inició nada/);
  state.error = null; state.row = { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", kind: "collections_review", status: "queued", session_id: "someone-else" };
  assert.match((await execute({ kind: "collections_review" })).error, /No afirmes que empezó/);
  assert.equal(jobs.length, 0);
});
