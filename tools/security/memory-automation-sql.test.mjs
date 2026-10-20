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
const session = "session-memory-agent";
const ownerSession = "session-memory-owner";
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
  await db.query("insert into auth.users(id) values ($1),($2),($3),($4)", [owner, agent, viewer, outsider]);
  await db.query("insert into tenants(id,name,slug) values ($1,'A','a'),($2,'B','b')", [tenant, other]);
  await db.query("insert into tenant_members(tenant_id,user_id,role) values ($1,$2,'owner'),($1,$3,'agent'),($1,$4,'viewer'),($5,$6,'owner')", [tenant, owner, agent, viewer, other, outsider]);
  await db.query("insert into jarvis_sessions(session_id,user_id,tenant_id) values ($1,$2,$3),($4,$5,$3)", [session, agent, tenant, ownerSession, owner]);
  await db.query("select nexo_save_product($1,$2,$3)", [tenant, owner, { name: "Tenis Urban", price_retail: 189000, variants: [{ color: "Blanco", size: "40", stock_qty: 100 }] }]);
});
after(async () => { await db?.close(); });
beforeEach(async () => {
  await db.exec("reset role; delete from nexo_activity_log; delete from nexo_suggestion_dismissals; delete from nexo_autonomy_settings; delete from nexo_catalog_proposals; delete from nexo_work_events; delete from nexo_work_items;");
});

const configure = (settings, user = owner) => db.query("select nexo_configure_autonomy($1,$2,$3) as v", [tenant, user, settings]).then(r => r.rows[0].v);
const learn = (input, { key = crypto.randomUUID(), user = agent } = {}) =>
  db.query("select nexo_learn_business_fact($1,$2,$3,$4,$5) as v", [tenant, user, session, key, input]).then(r => r.rows[0].v);
const propose = (title, user = agent, sess = session) => db.query("select nexo_propose_work($1,$2,$3,$4,$5) as v", [tenant, user, sess, crypto.randomUUID(), { kind: "memory", title }]).then(r => r.rows[0].v);
const change = (item, action, user = agent) => db.query("select nexo_change_work($1,$2,$3,$4,$5) as v", [tenant, user, item.id, item.revision, action]).then(r => r.rows[0].v);
const suggestions = (user = owner) => db.query("select nexo_automation_suggestions($1,$2) as v", [tenant, user]).then(r => r.rows[0].v);
const keys = async (user) => (await suggestions(user)).map(s => s.key).sort();
const fact = { kind: "memory", title: "Proveedor de tenis: Calzado Norte", body: "Entrega los martes." };

test("the owner decides whether Zorax learns from chat; everything starts off", async () => {
  await assert.rejects(configure({ learn_from_chat: true }, agent), /AUTONOMY_OWNER_REQUIRED/);
  await assert.rejects(configure({ learn_from_chat: "yes" }), /AUTONOMY_INPUT/);
  await assert.rejects(learn(fact), /MEMORY_DISABLED/);
  const settings = await configure({ learn_from_chat: true });
  assert.equal(settings.learn_from_chat, true); assert.equal(settings.catalog_stock, false);
  assert.equal((await configure({ catalog_stock: true })).learn_from_chat, true, "partial updates keep the other switches");
});

test("a stated fact is kept at once, shows in history and can be undone", async () => {
  await configure({ learn_from_chat: true });
  const learned = await learn(fact);
  assert.equal(learned.status, "active"); assert.equal(learned.auto, true); assert.equal(learned.duplicate, false);
  assert.equal(learned.kind, "memory"); assert.equal(learned.customer_id, null); assert.equal(learned.source_session, session); assert.ok(learned.log_id);
  const log = (await db.query("select summary, kind, status from nexo_activity_log where id=$1", [learned.log_id])).rows[0];
  assert.deepEqual(log, { summary: "Aprendió «Proveedor de tenis: Calzado Norte»", kind: "work", status: "applied" });
  assert.equal((await db.query("select nexo_activity_feed($1,$2,10) as v", [tenant, owner])).rows[0].v[0].undoable, true);
  assert.equal((await db.query("select nexo_undo_activity($1,$2,$3) as v", [tenant, owner, learned.log_id])).rows[0].v.ok, true);
  assert.equal((await db.query("select status from nexo_work_items where id=$1", [learned.id])).rows[0].status, "canceled");
});

test("never twice, never about a customer, never a task, never by viewers", async () => {
  await configure({ learn_from_chat: true });
  const key = "11111111-1111-4111-8111-aaaaaaaaaaaa";
  const first = await learn(fact, { key });
  const replay = await learn(fact, { key });
  assert.equal(replay.id, first.id); assert.equal(replay.duplicate, true); assert.equal(replay.auto, true);
  const same = await learn({ ...fact, title: "  proveedor DE tenis: calzado norte " });
  assert.equal(same.id, first.id); assert.equal(same.duplicate, true); assert.equal(same.auto, false);
  assert.equal((await db.query("select count(*)::int as n from nexo_work_items")).rows[0].n, 1);
  assert.equal((await db.query("select count(*)::int as n from nexo_activity_log")).rows[0].n, 1);
  const { rows: [ana] } = await db.query("insert into customers(tenant_id,phone,name) values ($1,'+573001112233','Ana') returning id", [tenant]);
  await assert.rejects(learn({ ...fact, title: "Ana prefiere talla 38", customer_id: ana.id }), /NEXO_INPUT/);
  await assert.rejects(learn({ kind: "task", title: "Llamar", due_at: new Date(Date.now() + 86400000).toISOString() }), /NEXO_INPUT/);
  await assert.rejects(learn({ kind: "memory", title: "" }), /NEXO_INPUT/);
  await assert.rejects(learn(fact, { user: viewer }), /NEXO_FORBIDDEN/);
  await db.exec("set role authenticated;");
  try { await assert.rejects(db.query("select nexo_learn_business_fact($1,$2,$3,$4,$5)", [tenant, agent, session, crypto.randomUUID(), fact]), /permission denied/); }
  finally { await db.exec("reset role;"); }
});

test("pinned memories: at most five, only active ones, unpinned when canceled", async () => {
  const proposed = await propose("Horario: lunes a sábado");
  await assert.rejects(change(proposed, "pin"), /NEXO_ACTION/, "proposals cannot be pinned");
  const active = await change(proposed, "confirm");
  assert.equal(active.pinned, false);
  const pinned = await change(active, "pin");
  assert.equal(pinned.pinned, true);
  for (let i = 0; i < 4; i++) await change(await change(await propose(`Dato ${i}`), "confirm"), "pin");
  const sixth = await change(await propose("Dato 6"), "confirm");
  await assert.rejects(change(sixth, "pin"), /NEXO_LIMIT/);
  await assert.rejects(change(sixth, "pin", viewer), /NEXO_FORBIDDEN/);
  const unpinned = await change(pinned, "unpin");
  assert.equal(unpinned.pinned, false);
  const again = await change(unpinned, "pin");
  assert.equal(again.pinned, true);
  assert.equal((await db.query("select count(*)::int as n from nexo_work_items where pinned")).rows[0].n, 5);
});

test("editing keeps the pin; canceling drops it", async () => {
  const item = await change(await change(await propose("Devoluciones: 8 días"), "confirm"), "pin");
  const edited = (await db.query("select nexo_change_work($1,$2,$3,$4,'edit',$5) as v", [tenant, agent, item.id, item.revision, { title: "Devoluciones: 10 días", body: "" }])).rows[0].v;
  assert.equal(edited.pinned, true); assert.equal(edited.title, "Devoluciones: 10 días");
  const canceled = await change(edited, "cancel");
  assert.equal(canceled.pinned, false);
  assert.equal((await db.query("select count(*)::int as n from nexo_work_items where pinned")).rows[0].n, 0);
});

test("suggestions appear only for the owner, after five confirmations by hand", async () => {
  const prepare = qty => db.query("select nexo_prepare_catalog_change($1,$2,$3,$4) as v", [tenant, owner, ownerSession, { action: "stock", items: [{ sku: "TENIS-URBAN-BLANCO-40", mode: "add", qty }] }]).then(r => r.rows[0].v.proposal);
  const decide = (id, decision) => db.query("select nexo_decide_catalog_change($1,$2,$3) as v", [id, owner, decision]).then(r => r.rows[0].v);
  await assert.rejects(suggestions(outsider), /SUGGESTIONS_FORBIDDEN/);
  assert.deepEqual(await suggestions(), []);
  for (let qty = 1; qty <= 4; qty++) await decide((await prepare(qty)).id, "confirm");
  assert.deepEqual(await suggestions(), [], "four confirmations are not enough");
  await decide((await prepare(5)).id, "confirm");
  assert.deepEqual(await suggestions(), [{ key: "catalog_stock", confirmed: 5, rejected: 0, undone: 0 }]);
  assert.deepEqual(await suggestions(agent), [], "only the owner is asked");
  await decide((await prepare(6)).id, "cancel");
  assert.deepEqual(await keys(), ["catalog_stock"], "one rejection in five is tolerated");
  const dismiss = (key, user = owner) => db.query("select nexo_dismiss_suggestion($1,$2,$3) as v", [tenant, user, key]).then(r => r.rows[0].v);
  await assert.rejects(dismiss("catalog_stock", agent), /SUGGESTIONS_FORBIDDEN/);
  await assert.rejects(dismiss("prices"), /SUGGESTIONS_INPUT/);
  await dismiss("catalog_stock");
  assert.deepEqual(await suggestions(), [], "dismissed for 30 days");
  await db.query("update nexo_suggestion_dismissals set until=now()-interval '1 day'");
  assert.deepEqual(await keys(), ["catalog_stock"]);
  await decide((await prepare(7)).id, "cancel");
  assert.deepEqual(await suggestions(), [], "two rejections in five are not tolerated");
  for (let qty = 8; qty <= 12; qty++) await decide((await prepare(qty)).id, "confirm");
  assert.deepEqual(await keys(), ["catalog_stock"]);
  await configure({ catalog_stock: true });
  assert.deepEqual(await suggestions(), [], "an enabled switch is never suggested");
  await db.exec("set role authenticated;");
  try { await assert.rejects(db.query("select nexo_automation_suggestions($1,$2)", [tenant, owner]), /permission denied/); }
  finally { await db.exec("reset role;"); }
});

test("undoing Zorax's own action silences the suggestion", async () => {
  const prepare = qty => db.query("select nexo_prepare_catalog_change($1,$2,$3,$4) as v", [tenant, owner, ownerSession, { action: "stock", items: [{ sku: "TENIS-URBAN-BLANCO-40", mode: "add", qty }] }]).then(r => r.rows[0].v.proposal);
  for (let qty = 1; qty <= 5; qty++) await db.query("select nexo_decide_catalog_change($1,$2,'confirm')", [(await prepare(qty)).id, owner]);
  await configure({ catalog_stock: true });
  const auto = (await db.query("select nexo_catalog_change_by_nexo($1,$2,$3,$4) as v", [tenant, agent, session, { action: "stock", items: [{ sku: "TENIS-URBAN-BLANCO-40", mode: "add", qty: 9 }] }])).rows[0].v;
  assert.equal(auto.auto, true);
  await db.query("select nexo_undo_activity($1,$2,$3)", [tenant, owner, auto.log_id]);
  await configure({ catalog_stock: false });
  assert.deepEqual(await suggestions(), [], "the owner already told Zorax not to do this alone");
});

test("tasks and memories confirmed by people count; the ones Zorax confirmed alone do not", async () => {
  await configure({ work_items: true });
  for (let i = 0; i < 5; i++) {
    const auto = (await db.query("select nexo_propose_work_by_nexo($1,$2,$3,$4,$5) as v", [tenant, agent, session, crypto.randomUUID(), { kind: "memory", title: `Auto ${i}` }])).rows[0].v;
    assert.equal(auto.auto, true);
  }
  await configure({ work_items: false });
  assert.deepEqual(await suggestions(), [], "Zorax's own confirmations are not the owner's habit");
  for (let i = 0; i < 5; i++) await change(await propose(`Dato ${i}`), "confirm");
  assert.deepEqual(await keys(), ["learn_from_chat", "work_items"], "five chat memories confirmed by hand suggest both switches");
  await change(await propose("Rechazado"), "cancel");
  assert.deepEqual(await keys(), ["learn_from_chat", "work_items"]);
  await change(await propose("Rechazado 2"), "cancel");
  assert.deepEqual(await keys(), [], "too many rejected proposals");
});
