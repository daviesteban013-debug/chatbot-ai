import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";

const tenant = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const viewer = "33333333-3333-4333-8333-333333333333";
const stranger = "44444444-4444-4444-8444-444444444444";
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
  await db.query("insert into auth.users(id) values ($1),($2)", [viewer, stranger]);
  await db.query("insert into tenants(id,name,slug) values ($1,'A','a'),($2,'B','b')", [tenant, other]);
  await db.query("insert into tenant_members(tenant_id,user_id,role) values ($1,$2,'viewer')", [tenant, viewer]);
});
after(async () => { await db?.close(); });

async function conversation(t = tenant, daysAgo = 0) {
  const customer = (await db.query("insert into customers(tenant_id,phone) values($1,$2) returning id", [t, `+57${Math.floor(Math.random() * 1e9)}`])).rows[0].id;
  const id = (await db.query("insert into conversations(tenant_id,customer_id) values($1,$2) returning id", [t, customer])).rows[0].id;
  await db.query("insert into messages(tenant_id,conversation_id,direction,sender,type,body,created_at) values($1,$2,'inbound','customer','text','hola',now()-make_interval(days=>$3))", [t, id, daysAgo]);
  return { id, customer };
}
async function order(chat, { total = 100000, status = "pending_payment", payment = "pending", by = "agent", daysAgo = 0, t = tenant, item = "Tenis" } = {}) {
  const id = (await db.query(`insert into orders(tenant_id,conversation_id,customer_id,status,payment_status,total,subtotal,created_by,created_at)
    values($1,$2,$3,$4,$5,$6,$6,$7,now()-make_interval(days=>$8)) returning id`, [t, chat.id, chat.customer, status, payment, total, by, daysAgo])).rows[0].id;
  const product = (await db.query("insert into products(tenant_id,sku,name,price_retail) values($1,$2,$3,1) returning id", [t, crypto.randomUUID(), item])).rows[0].id;
  const variant = (await db.query("insert into product_variants(tenant_id,product_id,sku,stock_qty) values($1,$2,$3,9) returning id", [t, product, crypto.randomUUID()])).rows[0].id;
  await db.query("insert into order_items(tenant_id,order_id,variant_id,name_snapshot,qty,unit_price) values($1,$2,$3,$4,2,$5)", [t, id, variant, item, total / 2]);
  return id;
}
const metrics = (days = 7, user = viewer) => db.query("select nexo_sales_metrics($1,$2,$3) as v", [tenant, user, days]).then(r => r.rows[0].v);

test("results count what NEXO sold, collected and recovered, compared with the previous period", async () => {
  const a = await conversation(), b = await conversation(), c = await conversation(), d = await conversation();
  await order(a, { total: 200000, payment: "paid" });
  const recoveredOrder = await order(b, { total: 100000, payment: "paid", item: "Gorra" });
  await order(c, { total: 50000, by: "human" });
  await order(d, { total: 1000000, status: "draft" });
  await order(d, { total: 1000000, status: "canceled" });
  const message = (await db.query("select id from messages where conversation_id=$1", [b.id])).rows[0].id;
  await db.query("insert into nexo_sales_followups(tenant_id,conversation_id,customer_id,order_id,basis_message_id,reminder_no,due_at,status) values($1,$2,$3,$4,$5,1,now(),'sent')", [tenant, b.id, b.customer, recoveredOrder, message]);
  await db.query("insert into handoffs(tenant_id,conversation_id,reason,summary) values($1,$2,'otro','x')", [tenant, d.id]);
  const old = await conversation(tenant, 10);
  await order(old, { total: 70000, daysAgo: 10 });
  const foreign = await conversation(other);
  await order(foreign, { total: 5000000, t: other });

  const result = await metrics(7);
  assert.equal(result.days, 7);
  assert.deepEqual(
    [result.current.conversations, result.current.converted, result.current.orders, result.current.sales],
    [4, 3, 3, 350000], "drafts, canceled orders and other businesses are excluded");
  assert.deepEqual([result.current.agentOrders, result.current.agentSales], [2, 300000]);
  assert.deepEqual([result.current.paidOrders, result.current.collected], [2, 300000]);
  assert.deepEqual([result.current.recoveredOrders, result.current.recovered], [1, 100000]);
  assert.equal(result.current.handoffs, 1);
  assert.deepEqual([result.previous.orders, result.previous.sales], [1, 70000]);
  assert.equal(result.daily.length, 7);
  assert.equal(result.daily.at(-1).sales, 350000);
  assert.deepEqual(result.topProducts.map(p => [p.name, p.qty]), [["Tenis", 4], ["Gorra", 2]]);
});

test("metrics are for members of the business only and only for supported periods", async () => {
  await assert.rejects(metrics(7, stranger), /metrics_forbidden/);
  await assert.rejects(metrics(14), /metrics_invalid/);
  assert.equal((await metrics(90)).daily.length, 90);
  await db.exec("set role authenticated;");
  try { await assert.rejects(metrics(7), /permission denied/); }
  finally { await db.exec("reset role;"); }
});
