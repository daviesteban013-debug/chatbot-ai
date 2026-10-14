import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";

const tenant = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const owner = "33333333-3333-4333-8333-333333333333";
const outsider = "44444444-4444-4444-8444-444444444444";
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
  await db.query("insert into auth.users(id) values ($1),($2)", [owner, outsider]);
  await db.query("insert into tenants(id,name,slug) values ($1,'A','a'),($2,'B','b')", [tenant, other]);
  await db.query("insert into tenant_members(tenant_id,user_id,role) values ($1,$2,'owner'),($3,$4,'owner')", [tenant, owner, other, outsider]);
  await db.query("select nexo_save_product($1,$2,$3)", [tenant, owner, { name: "Tenis Urban", price_retail: 189000, variants: [{ color: "Blanco", size: "40", stock_qty: 0 }, { color: "Blanco", size: "41", stock_qty: 5 }] }]);
  const { rows: [ana] } = await db.query("insert into customers(tenant_id,phone,name) values ($1,'+573001112233','Ana') returning id", [tenant]);
  const { rows: [chat] } = await db.query("insert into conversations(tenant_id,customer_id) values ($1,$2) returning id", [tenant, ana.id]);
  await db.query("insert into handoffs(tenant_id,conversation_id,reason,summary,status) values ($1,$2,'solicitud_cliente','Quiere hablar con alguien','open')", [tenant, chat.id]);
  await db.query(`insert into orders(tenant_id,customer_id,status,total,payment_status,created_by) values
    ($1,$2,'pending_approval',350000,'pending','agent'), ($1,$2,'confirmed',189000,'paid','agent'), ($1,$2,'canceled',1000,'pending','agent')`, [tenant, ana.id]);
  await db.query("insert into nexo_work_items(tenant_id,kind,title,status,due_at,timezone,created_by,assignee_id,request_key) values ($1,'task','Llamar a Ana','active',now()-interval '1 hour','America/Bogota',$2,$2,gen_random_uuid())", [tenant, owner]);
});
after(async () => { await db?.close(); });

test("the pulse lists what needs attention in this business", async () => {
  const pulse = (await db.query("select nexo_pulse($1,$2) as v", [tenant, owner])).rows[0].v;
  assert.equal(pulse.handoffs.length, 1); assert.equal(pulse.handoffs[0].customer, "Ana");
  assert.deepEqual(pulse.approvals.map(o => o.total), [350000]);
  assert.deepEqual(pulse.payments.map(o => o.total), [189000]);
  assert.deepEqual(pulse.sales.map(o => o.total), [189000], "canceled and pending-approval orders are not sales");
  assert.deepEqual(pulse.stockouts.map(v => v.label), ["Tenis Urban · Blanco · 40"]);
  assert.deepEqual(pulse.tasks.map(t => t.title), ["Llamar a Ana"]);
});

test("only members read it, and never through the browser roles", async () => {
  await assert.rejects(db.query("select nexo_pulse($1,$2)", [tenant, outsider]), /PULSE_FORBIDDEN/);
  const empty = (await db.query("select nexo_pulse($1,$2) as v", [other, outsider])).rows[0].v;
  assert.equal(empty.handoffs.length + empty.approvals.length + empty.stockouts.length, 0);
  await db.exec("set role authenticated;");
  try { await assert.rejects(db.query("select nexo_pulse($1,$2)", [tenant, owner]), /permission denied/); }
  finally { await db.exec("reset role;"); }
});
