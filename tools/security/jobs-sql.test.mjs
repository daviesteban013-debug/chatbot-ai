import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";

const tenant = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const owner = "33333333-3333-4333-8333-333333333333";
const agent = "44444444-4444-4444-8444-444444444444";
const viewer = "55555555-5555-4555-8555-555555555555";
const outsider = "66666666-6666-4666-8666-666666666666";
const session = "session-jobs-agent";
const ownerSession = "session-jobs-owner";
const xlsx = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const pdf = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const foreign = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const SHEET = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
let db;
before(async () => {
  db = new PGlite({ extensions: { vector } });
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid; $$;
    grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`);
  const dir = new URL("../../supabase/migrations/", import.meta.url);
  for (const file of (await readdir(dir)).filter(f => f.endsWith(".sql")).sort())
    await db.exec((await readFile(new URL(file, dir), "utf8")).replace("create extension if not exists pgcrypto;", ""));
  // Supabase grants browser roles table access by default; the policies decide what they see.
  await db.exec("grant select on tenant_members to authenticated");
  await db.query("insert into auth.users(id) values ($1),($2),($3),($4)", [owner, agent, viewer, outsider]);
  await db.query("insert into tenants(id,name,slug) values ($1,'A','a'),($2,'B','b')", [tenant, other]);
  await db.query("insert into tenant_members(tenant_id,user_id,role) values ($1,$2,'owner'),($1,$3,'agent'),($1,$4,'viewer'),($5,$6,'owner')", [tenant, owner, agent, viewer, other, outsider]);
  await db.query("insert into jarvis_sessions(session_id,user_id,tenant_id) values ($1,$2,$3),($4,$5,$3)", [session, agent, tenant, ownerSession, owner]);
  await db.query(`insert into jarvis_files(id,user_id,filename,object_path,mime_type,byte_size,status,sections,warnings) values
    ($1::uuid,$2::uuid,'stock.xlsx',$3,$4,100,'ready','[]','[]'), ($5::uuid,$2::uuid,'catalogo.pdf',$6,'application/pdf',100,'ready','[]','[]'),
    ($7::uuid,$8::uuid,'otro.csv',$9,'text/csv',100,'ready','[]','[]')`,
    [xlsx, agent, `${agent}/${xlsx}`, SHEET, pdf, `${agent}/${pdf}`, foreign, owner, `${owner}/${foreign}`]);
  await db.query("select nexo_save_product($1,$2,$3)", [tenant, owner, { name: "Tenis Urban", price_retail: 189000, variants: [{ color: "Blanco", size: "40", stock_qty: 20 }] }]);
});
after(async () => { await db?.close(); });
beforeEach(async () => {
  await db.exec("reset role; select set_config('request.jwt.claim.sub','',false); delete from nexo_activity_log; delete from nexo_jobs; delete from nexo_worker_tickets; delete from nexo_catalog_proposals; update jarvis_files set session_id=null;");
});

const start = (kind, input, { user = agent, sess = session, key = crypto.randomUUID() } = {}) =>
  db.query("select nexo_start_job($1,$2,$3,$4,$5,$6) as v", [tenant, user, sess, kind, input, key]).then(r => r.rows[0].v);
const claim = () => db.query("select nexo_claim_jobs(1) as v").then(r => r.rows[0].v);
const heartbeat = (id, lease, progress = null, checkpoint = null) => db.query("select nexo_job_heartbeat($1,$2,$3,$4) as v", [id, lease, progress, checkpoint]).then(r => r.rows[0].v);
const release = (id, lease, checkpoint = null) => db.query("select nexo_release_job($1,$2,$3,null) as v", [id, lease, checkpoint]).then(r => r.rows[0].v);
const finish = (id, lease, status, result = null, error = null) => db.query("select nexo_finish_job($1,$2,$3,$4,$5) as v", [id, lease, status, result, error]).then(r => r.rows[0].v);
const cancel = (id, user = agent) => db.query("select nexo_cancel_job($1,$2,$3) as v", [tenant, user, id]).then(r => r.rows[0].v);
const job = id => db.query("select * from nexo_jobs where id=$1", [id]).then(r => r.rows[0]);
const feed = (user = owner) => db.query("select nexo_activity_feed($1,$2,10) as v", [tenant, user]).then(r => r.rows[0].v);

test("starting a job checks the role, the conversation and the files", async () => {
  await assert.rejects(start("collections_review", {}, { user: viewer }), /JOB_FORBIDDEN/);
  await assert.rejects(start("collections_review", {}, { sess: ownerSession }), /JOB_FORBIDDEN/, "another user's conversation");
  await assert.rejects(start("catalog_import", {}), /JOB_FILES/);
  await assert.rejects(start("catalog_update", { file_ids: [pdf] }), /JOB_FILES/, "stock updates need a spreadsheet");
  await assert.rejects(start("catalog_update", { file_ids: [foreign] }), /JOB_FILES/, "another user's file");
  await assert.rejects(start("collections_review", { file_ids: [xlsx] }), /JOB_FILES/);
  await assert.rejects(start("catalog_import", { file_ids: [pdf, pdf] }), /JOB_INPUT/);
  await assert.rejects(start("sales_report", {}), /JOB_INPUT/);
  const created = await start("catalog_update", { file_ids: [xlsx], note: "x".repeat(600), options: { mode: "set" } }, { key: "k1" });
  assert.equal(created.status, "queued"); assert.equal(created.existing, false);
  assert.equal(created.input.note.length, 500); assert.deepEqual(created.input.options, { mode: "set" });
  assert.equal((await db.query("select session_id from jarvis_files where id=$1", [xlsx])).rows[0].session_id, session, "the file is bound to the conversation");
  const again = await start("catalog_update", { file_ids: [xlsx] }, { key: "k1" });
  assert.equal(again.existing, true); assert.equal(again.id, created.id);
  await start("collections_review", {});
  await assert.rejects(start("collections_review", {}), /JOB_LIMIT/, "two active jobs per business");
});

test("a worker claims under a lease, checkpoints, hands back and finishes with history", async () => {
  const created = await start("catalog_import", { file_ids: [pdf] });
  assert.deepEqual((await claim()).map(j => j.id), [created.id]);
  const running = await job(created.id);
  assert.equal(running.status, "running"); assert.ok(running.lease_token); assert.equal(running.rounds, 1); assert.ok(running.started_at);
  assert.deepEqual(await claim(), [], "a running job is not claimed twice");
  assert.equal((await heartbeat(created.id, crypto.randomUUID())).reason, "lease_lost");
  assert.deepEqual(await heartbeat(created.id, running.lease_token, { done: 3, total: 10 }, { chunk: 3 }), { ok: true, canceled: false });
  assert.deepEqual((await job(created.id)).checkpoint, { chunk: 3 });
  assert.equal((await release(created.id, running.lease_token, { chunk: 5 })).status, "queued");
  const queued = await job(created.id);
  assert.equal(queued.status, "queued"); assert.equal(queued.lease_token, null); assert.deepEqual(queued.checkpoint, { chunk: 5 }); assert.deepEqual(queued.progress, { done: 3, total: 10 });
  const [second] = await claim();
  assert.equal(second.rounds, 2); assert.deepEqual(second.checkpoint, { chunk: 5 });
  const prepared = (await db.query("select nexo_prepare_catalog_change($1,$2,$3,$4) as v", [tenant, agent, session, { action: "price", items: [{ sku: "TENIS-URBAN", price: 199000 }] }])).rows[0].v;
  assert.equal((await finish(created.id, crypto.randomUUID(), "done", { summary: "x" })).reason, "lease_lost");
  const done = await finish(created.id, second.lease_token, "done", { summary: "Dejé 12 productos listos para revisar", drafts: [], proposal_ids: [prepared.proposal.id] });
  assert.deepEqual(done, { ok: true, status: "done" });
  const finished = await job(created.id);
  assert.equal(finished.status, "done"); assert.deepEqual(finished.checkpoint, {}); assert.ok(finished.finished_at); assert.equal(finished.lease_token, null);
  const left = (await db.query("select extract(epoch from expires_at - now()) as s from nexo_catalog_proposals where id=$1", [prepared.proposal.id])).rows[0].s;
  assert.ok(Number(left) > 23 * 3600, "price cards prepared by a job stay reviewable for a day");
  const [entry] = await feed();
  assert.equal(entry.kind, "job"); assert.equal(entry.text, "Dejé 12 productos listos para revisar");
  assert.equal(entry.href, `/dashboard/jobs/${created.id}`); assert.equal(entry.undoable, false);
  assert.equal((await db.query("select nexo_undo_activity($1,$2,$3) as v", [tenant, owner, entry.log_id])).rows[0].v.code, "not_undoable");
  const pulse = (await db.query("select nexo_pulse($1,$2) as v", [tenant, agent])).rows[0].v;
  assert.deepEqual(pulse.jobs.map(j => [j.id, j.status, j.summary]), [[created.id, "done", "Dejé 12 productos listos para revisar"]]);
  assert.equal((await db.query("select nexo_pulse($1,$2) as v", [tenant, owner])).rows[0].v.jobs.length, 0, "each user hears about their own jobs");
  assert.equal((await finish(created.id, second.lease_token, "done", { summary: "again" })).ok, false, "finishing twice does nothing");
  assert.equal((await db.query("select count(*)::int as n from nexo_activity_log")).rows[0].n, 1);
});

test("failures keep a public message and show up in history and the pulse", async () => {
  const created = await start("collections_review", {});
  const [claimed] = await claim();
  await assert.rejects(finish(created.id, claimed.lease_token, "maybe"), /JOB_INPUT/);
  await assert.rejects(finish(created.id, claimed.lease_token, "done", null), /JOB_INPUT/, "done needs a result");
  assert.deepEqual(await finish(created.id, claimed.lease_token, "failed", null, "Me quedé sin créditos. " + "x".repeat(400)), { ok: true, status: "failed" });
  const failed = await job(created.id);
  assert.equal(failed.status, "failed"); assert.equal(failed.error.length, 300); assert.equal(failed.result, null);
  assert.equal((await feed())[0].text, "No pude terminar: Revisión de cobros");
  const pulse = (await db.query("select nexo_pulse($1,$2) as v", [tenant, agent])).rows[0].v;
  assert.equal(pulse.jobs[0].status, "failed"); assert.match(pulse.jobs[0].summary, /^Me quedé sin créditos/);
});

test("cancel stops a queued or running job, and the worker learns of it", async () => {
  const queued = await start("collections_review", {});
  await assert.rejects(cancel(queued.id, viewer), /JOB_FORBIDDEN/);
  await assert.rejects(cancel(crypto.randomUUID()), /JOB_NOT_FOUND/);
  await assert.rejects(db.query("select nexo_cancel_job($1,$2,$3)", [other, outsider, queued.id]), /JOB_NOT_FOUND/, "another business cannot touch it");
  const canceled = await cancel(queued.id);
  assert.equal(canceled.status, "canceled"); assert.equal(canceled.canceled_by, agent); assert.ok(canceled.finished_at);
  assert.deepEqual(await claim(), []);
  const second = await start("collections_review", {});
  const [running] = await claim();
  assert.equal((await cancel(second.id, owner)).status, "canceled");
  assert.deepEqual(await heartbeat(second.id, running.lease_token), { ok: false, canceled: true, reason: "canceled" });
  assert.equal((await finish(second.id, running.lease_token, "done", { summary: "tarde" })).canceled, true);
  assert.equal((await job(second.id)).status, "canceled");
  assert.equal((await cancel(second.id)).status, "canceled", "canceling again is harmless");
  assert.equal((await db.query("select count(*)::int as n from nexo_activity_log")).rows[0].n, 0, "canceled jobs leave no history entry");
});

test("a vanished worker loses its lease; the job resumes, then fails after four losses", async () => {
  const created = await start("collections_review", {});
  for (let i = 1; i <= 3; i++) {
    const [claimed] = await claim();
    assert.equal(claimed.id, created.id);
    await db.query("update nexo_jobs set lease_until=now()-interval '1 second' where id=$1", [created.id]);
  }
  const [fourth] = await claim();
  assert.equal(fourth.rounds, 4); assert.equal(fourth.attempts, 3);
  await db.query("update nexo_jobs set lease_until=now()-interval '1 second' where id=$1", [created.id]);
  assert.deepEqual(await claim(), []);
  const failed = await job(created.id);
  assert.equal(failed.status, "failed"); assert.equal(failed.attempts, 4); assert.match(failed.error, /perdió la conexión/);
  assert.equal((await feed())[0].text, "No pude terminar: Revisión de cobros");
});

test("a job that needs more than ten rounds fails instead of running forever", async () => {
  const created = await start("collections_review", {});
  await db.query("update nexo_jobs set rounds=9 where id=$1", [created.id]);
  const [claimed] = await claim();
  assert.equal(claimed.rounds, 10);
  assert.equal((await release(created.id, claimed.lease_token, { page: 9 })).status, "failed");
  const failed = await job(created.id);
  assert.match(failed.error, /tardó demasiado/); assert.deepEqual(failed.checkpoint, {});
});

test("applying an import review is recorded once", async () => {
  const mark = (id, user = agent, outcome = { created: 2, updated: 0, skipped: 0 }) =>
    db.query("select nexo_mark_job_applied($1,$2,$3,$4) as v", [tenant, user, id, outcome]).then(r => r.rows[0].v);
  const created = await start("catalog_import", { file_ids: [pdf] });
  await assert.rejects(mark(created.id), /JOB_STATE/, "only finished imports");
  const [claimed] = await claim();
  await finish(created.id, claimed.lease_token, "done", { summary: "ok", drafts: [{ name: "Gorra" }] });
  await assert.rejects(mark(created.id, viewer), /JOB_FORBIDDEN/);
  const applied = await mark(created.id);
  assert.ok(applied.applied_at);
  assert.deepEqual(applied.result, { summary: "ok", drafts: [{ name: "Gorra" }], applied: { created: 2, updated: 0, skipped: 0 } });
  await assert.rejects(mark(created.id), /JOB_STATE/);
  const review = await start("collections_review", {});
  const [second] = await claim();
  await finish(review.id, second.lease_token, "done", { summary: "ok" });
  await assert.rejects(mark(review.id), /JOB_STATE/, "only catalog imports are applied");
});

test("collections: unpaid orders come in pages and each knows where it stands with reminders", async () => {
  const { rows: [ana] } = await db.query("insert into customers(tenant_id,phone,name) values ($1,'+573001112233','Ana') returning id", [tenant]);
  const { rows: [luis] } = await db.query("insert into customers(tenant_id,phone,name) values ($1,'+573001112244','') returning id", [tenant]);
  const { rows: [chat] } = await db.query("insert into conversations(tenant_id,customer_id) values ($1,$2) returning id", [tenant, ana.id]);
  const order = (customer, ago, method, extra = {}) => db.query(
    `insert into orders(tenant_id,customer_id,conversation_id,status,total,payment_status,payment_method,created_by,created_at)
     values ($1,$2,$3,$4,$5,$6,$7,'agent',now()-$8::interval) returning id`,
    [tenant, customer, extra.conversation ?? null, extra.status ?? "pending_payment", extra.total ?? 100000, extra.paid ? "paid" : "pending", method, ago]).then(r => r.rows[0].id);
  const confirmed = async (orderId) => (await db.query("insert into messages(tenant_id,conversation_id,direction,sender,type,body,raw) values ($1,$2,'inbound','customer','text','sí',$3) returning id",
    [tenant, chat.id, { nexo_confirmed_order: orderId }])).rows[0].id;
  const oldest = await order(ana.id, "30 hours", "enlace", { conversation: chat.id });
  await confirmed(oldest);
  const cash = await order(luis.id, "3 hours", "contraentrega");
  const unconfirmed = await order(ana.id, "2 hours", "transferencia", { conversation: chat.id });
  const scheduled = await order(ana.id, "90 minutes", "enlace", { conversation: chat.id });
  const basis = await confirmed(scheduled);
  const reminded = await order(ana.id, "1 hour", "enlace", { conversation: chat.id });
  const remindedBasis = await confirmed(reminded);
  const replied = await order(ana.id, "45 minutes", "enlace", { conversation: chat.id });
  const repliedBasis = await confirmed(replied);
  const fresh = await order(ana.id, "30 minutes", "enlace", { conversation: chat.id });
  await confirmed(fresh);
  await order(ana.id, "20 minutes", "enlace", { paid: true });
  await order(ana.id, "10 minutes", "enlace", { status: "confirmed" });
  await db.query(`insert into nexo_sales_followups(tenant_id,conversation_id,customer_id,order_id,basis_message_id,reminder_no,due_at,status,dispatched_at,reason) values
    ($1,$2,$3,$4,$5,1,now()+interval '20 minutes','queued',null,null),
    ($1,$2,$3,$6,$7,1,now()-interval '10 minutes','sent',now()-interval '9 minutes',null),
    ($1,$2,$3,$8,$9,1,now()-interval '5 minutes','canceled',null,'customer_replied')`,
    [tenant, chat.id, ana.id, scheduled, basis, reminded, remindedBasis, replied, repliedBasis]);

  const page = (after = null, limit = 3) => db.query("select nexo_unpaid_orders($1,$2,$3,$4) as v", [tenant, after?.created_at ?? null, after?.id ?? null, limit]).then(r => r.rows[0].v);
  const first = await page();
  assert.deepEqual(first.map(o => o.id), [oldest, cash, unconfirmed], "oldest first");
  assert.deepEqual(first[1].customer, { id: luis.id, name: null, phone: "+573001112244" });
  const second = await page(first.at(-1));
  const third = await page(second.at(-1));
  assert.deepEqual([...second, ...third].map(o => o.id), [scheduled, reminded, replied, fresh], "paid and confirmed orders are not collections");
  assert.deepEqual(await page(third.at(-1)), []);

  const status = ids => db.query("select nexo_collections_status($1,$2) as v", [tenant, ids]).then(r => r.rows[0].v);
  await assert.rejects(status([]), /JOB_INPUT/);
  const paused = await status([fresh]);
  assert.deepEqual(paused[fresh], { state: "requires_call", reason: "followups_paused", reminders: 0 });
  await db.query("select nexo_configure_sales_followups($1,$2,true,60,1)", [tenant, owner]);
  const all = await status([oldest, cash, unconfirmed, scheduled, reminded, replied, fresh]);
  assert.deepEqual(all[oldest], { state: "requires_call", reason: "service_window_closed", reminders: 0 });
  assert.deepEqual(all[cash], { state: "requires_call", reason: "payment_method", reminders: 0 });
  assert.deepEqual(all[unconfirmed], { state: "requires_call", reason: "not_whatsapp_confirmed", reminders: 0 });
  assert.equal(all[scheduled].state, "scheduled"); assert.ok(all[scheduled].due_at); assert.equal(all[scheduled].reason, undefined);
  assert.equal(all[reminded].state, "reminded"); assert.equal(all[reminded].reminders, 1); assert.ok(all[reminded].reminded_at);
  assert.deepEqual(all[replied], { state: "requires_call", reason: "customer_replied", reminders: 0 });
  assert.deepEqual(all[fresh], { state: "requires_call", reason: "not_eligible", reminders: 0 });
  assert.deepEqual(await status([crypto.randomUUID()]), {}, "unknown orders are simply absent");
  assert.equal((await db.query("select count(*)::int as n from nexo_sales_followups")).rows[0].n, 3, "reading the status never creates reminders");
});

test("browser roles never run the job RPCs, and only owners and agents read jobs", async () => {
  const created = await start("collections_review", {});
  await db.exec("set role authenticated;");
  try {
    await assert.rejects(db.query("select nexo_claim_jobs(1)"), /permission denied/);
    await assert.rejects(db.query("select nexo_start_job($1,$2,$3,'collections_review','{}','k')", [tenant, agent, session]), /permission denied/);
    await assert.rejects(db.query("select nexo_cancel_job($1,$2,$3)", [tenant, agent, created.id]), /permission denied/);
    await assert.rejects(db.query("select nexo_collections_status($1,$2)", [tenant, [created.id]]), /permission denied/);
    await assert.rejects(db.query("insert into nexo_worker_tickets(token_hash,worker,expires_at) values ('x','jobs',now())"), /permission denied/);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [viewer]);
    assert.equal((await db.query("select count(*)::int as n from nexo_jobs")).rows[0].n, 0, "viewers see no jobs");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [outsider]);
    assert.equal((await db.query("select count(*)::int as n from nexo_jobs")).rows[0].n, 0, "other businesses see nothing");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
    assert.equal((await db.query("select count(*)::int as n from nexo_jobs")).rows[0].n, 1, "the team reads its jobs");
    await assert.rejects(db.query("update nexo_jobs set status='done' where id=$1", [created.id]), /permission denied/);
  } finally { await db.exec("reset role; select set_config('request.jwt.claim.sub','',false);"); }
});
