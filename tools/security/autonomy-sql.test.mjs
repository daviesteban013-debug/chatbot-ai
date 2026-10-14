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
const session = "session-autonomy";
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
  await db.query("insert into auth.users(id) values ($1),($2),($3)", [owner, agent, viewer]);
  await db.query("insert into tenants(id,name,slug) values ($1,'A','a'),($2,'B','b')", [tenant, other]);
  await db.query("insert into tenant_members(tenant_id,user_id,role) values ($1,$2,'owner'),($1,$3,'agent'),($1,$4,'viewer')", [tenant, owner, agent, viewer]);
  await db.query("insert into jarvis_sessions(session_id,user_id,tenant_id) values ($1,$2,$3)", [session, agent, tenant]);
});
after(async () => { await db?.close(); });
beforeEach(async () => {
  await db.exec("reset role; delete from nexo_activity_log; delete from nexo_autonomy_settings; delete from nexo_catalog_proposals; delete from nexo_work_items; delete from product_variants; delete from products;");
  await db.query("select nexo_save_product($1,$2,$3)", [tenant, owner, { name: "Tenis Urban", price_retail: 189000, variants: [{ color: "Blanco", size: "40", stock_qty: 2 }] }]);
});

const configure = (settings, user = owner) => db.query("select nexo_configure_autonomy($1,$2,$3) as v", [tenant, user, settings]).then(r => r.rows[0].v);
const change = c => db.query("select nexo_catalog_change_by_nexo($1,$2,$3,$4) as v", [tenant, agent, session, c]).then(r => r.rows[0].v);
const stock = () => db.query("select stock_qty from product_variants where sku='TENIS-URBAN-BLANCO-40'").then(r => r.rows[0].stock_qty);
const undo = (id, user = agent) => db.query("select nexo_undo_activity($1,$2,$3) as v", [tenant, user, id]).then(r => r.rows[0].v);
const addStock = { action: "stock", items: [{ sku: "TENIS-URBAN-BLANCO-40", mode: "add", qty: 20 }] };

test("only the owner configures autonomy, and everything starts off", async () => {
  await assert.rejects(configure({ catalog_stock: true }, agent), /AUTONOMY_OWNER_REQUIRED/);
  await assert.rejects(configure({ prices: true }), /AUTONOMY_INPUT/);
  const off = await change(addStock);
  assert.equal(off.auto, false); assert.equal(off.proposal.status, "pending");
  assert.equal(await stock(), 2, "with autonomy off nothing changes until a click");
});

test("enabled stock changes apply at once, are logged and can be undone", async () => {
  await configure({ catalog_stock: true });
  const result = await change(addStock);
  assert.equal(result.auto, true); assert.equal(result.proposal.status, "applied"); assert.equal(result.proposal.applied_by_nexo, true);
  assert.equal(await stock(), 22);
  const log = (await db.query("select summary, status from nexo_activity_log where id=$1", [result.log_id])).rows[0];
  assert.deepEqual(log, { summary: "Stock de Tenis Urban · Blanco · 40: 2 → 22", status: "applied" });
  assert.equal((await undo(result.log_id)).ok, true);
  assert.equal(await stock(), 2);
  assert.equal((await undo(result.log_id)).code, "undone");
});

test("undo refuses when someone changed the value afterwards; viewers cannot undo", async () => {
  await configure({ catalog_stock: true });
  const result = await change(addStock);
  await assert.rejects(undo(result.log_id, viewer), /ACTIVITY_FORBIDDEN/);
  await db.query("update product_variants set stock_qty=21 where sku='TENIS-URBAN-BLANCO-40'");
  assert.equal((await undo(result.log_id)).code, "changed");
  assert.equal(await stock(), 21);
});

test("prices and new products are never applied automatically, even with every switch on", async () => {
  await configure({ catalog_stock: true, catalog_availability: true, work_items: true });
  const price = await change({ action: "price", items: [{ sku: "TENIS-URBAN", price: 1 }] });
  assert.equal(price.auto, false); assert.equal(price.proposal.status, "pending");
  const created = await change({ action: "create", product: { name: "Gorra", price_retail: 35000 } });
  assert.equal(created.auto, false);
  assert.equal((await db.query("select price_retail from products where sku='TENIS-URBAN'")).rows[0].price_retail, 189000);
  const hidden = await change({ action: "availability", items: [{ sku: "TENIS-URBAN", active: false }] });
  assert.equal(hidden.auto, true);
  assert.equal((await db.query("select summary from nexo_activity_log where id=$1", [hidden.log_id])).rows[0].summary, "Ocultó Tenis Urban");
});

test("tasks requested to NEXO are confirmed when enabled, and undo cancels them", async () => {
  const input = { kind: "task", title: "Llamar a María", body: "", due_at: new Date(Date.now() + 86400000).toISOString(), timezone: "America/Bogota" };
  const propose = key => db.query("select nexo_propose_work_by_nexo($1,$2,$3,$4,$5) as v", [tenant, agent, session, key, input]).then(r => r.rows[0].v);
  const pending = await propose(crypto.randomUUID());
  assert.equal(pending.auto, false); assert.equal(pending.status, "proposed");
  await configure({ work_items: true });
  const active = await propose(crypto.randomUUID());
  assert.equal(active.auto, true); assert.equal(active.status, "active");
  assert.equal(await propose(crypto.randomUUID()).then(v => v.status), "active");
  assert.equal((await undo(active.log_id)).ok, true);
  assert.equal((await db.query("select status from nexo_work_items where id=$1", [active.id])).rows[0].status, "canceled");
});

test("the activity feed shows this business's NEXO work only, for owners and agents", async () => {
  await configure({ catalog_stock: true });
  await change(addStock);
  const feed = (await db.query("select nexo_activity_feed($1,$2,10) as v", [tenant, owner])).rows[0].v;
  assert.equal(feed.length, 1); assert.equal(feed[0].kind, "catalog"); assert.equal(feed[0].undoable, true);
  await assert.rejects(db.query("select nexo_activity_feed($1,$2,10)", [tenant, viewer]), /ACTIVITY_FORBIDDEN/);
  await assert.rejects(db.query("select nexo_activity_feed($1,$2,10)", [other, owner]), /ACTIVITY_FORBIDDEN/);
  await db.exec("set role authenticated;");
  try { await assert.rejects(db.query("select nexo_undo_activity($1,$2,$3)", [tenant, owner, crypto.randomUUID()]), /permission denied/); }
  finally { await db.exec("reset role;"); }
});
