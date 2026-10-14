import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";

const tenant = "11111111-1111-4111-8111-111111111111";
const owner = "33333333-3333-4333-8333-333333333333";
const viewer = "44444444-4444-4444-8444-444444444444";
const newcomer = "55555555-5555-4555-8555-555555555555";
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
  await db.query("insert into auth.users(id) values ($1),($2),($3)", [owner, viewer, newcomer]);
  await db.query("insert into tenants(id,name,slug) values ($1,'A','a')", [tenant]);
  await db.query("insert into tenant_members(tenant_id,user_id,role) values ($1,$2,'owner'),($1,$3,'viewer')", [tenant, owner, viewer]);
});
after(async () => { await db?.close(); });
beforeEach(async () => { await db.exec("reset role; truncate public.credit_requests, public.credit_periods; delete from order_items; delete from orders; delete from product_variants; delete from products;"); });

test("credit reservations left pending by a failed call are released after 15 minutes, settled ones are not", async () => {
  const reserve = async () => { const id = crypto.randomUUID(); await db.query("select reserve_credits($1,$2,null,5000,5000,'whatsapp')", [id, tenant]); return id; };
  const stale = await reserve(), fresh = await reserve(), settled = await reserve();
  await db.query("select settle_credits($1,100,100,'m')", [settled]);
  await db.query("update credit_requests set created_at=now()-interval '20 minutes' where id in ($1,$2)", [stale, settled]);
  const reserved = async () => (await db.query("select credit_balance($1,null) as v", [tenant])).rows[0].v.reservedTokens;
  assert.equal(await reserved(), 10000);
  assert.equal((await db.query("select nexo_expire_credit_reservations() as n")).rows[0].n, 1);
  assert.equal(await reserved(), 5000);
  const states = Object.fromEntries((await db.query("select id,state from credit_requests")).rows.map(r => [r.id, r.state]));
  assert.deepEqual([states[stale], states[fresh], states[settled]], ["released", "reserved", "settled"]);
  await db.exec("set role authenticated;");
  try { await assert.rejects(db.query("select nexo_expire_credit_reservations()"), /permission denied/); }
  finally { await db.exec("reset role;"); }
});

test("provisioning is idempotent: concurrent signups of one user create a single business", async () => {
  const provision = slug => db.query("select nexo_provision_tenant($1,'Mi tienda',$2) as id", [newcomer, slug]).then(r => r.rows[0].id);
  const [a, b] = await Promise.all([provision("mi-tienda-1"), provision("mi-tienda-2")]);
  assert.equal(a, b);
  assert.equal((await db.query("select count(*)::int as n from tenant_members where user_id=$1", [newcomer])).rows[0].n, 1);
  assert.equal((await db.query("select role from tenant_members where user_id=$1", [newcomer])).rows[0].role, "owner");
  assert.equal(await provision("mi-tienda-3"), a);
  assert.equal(await db.query("select nexo_provision_tenant($1,'Otra','otra') as id", [owner]).then(r => r.rows[0].id), tenant, "an existing member keeps their business");
  await db.exec("set role authenticated;");
  try { await assert.rejects(provision("x"), /permission denied/); }
  finally { await db.exec("reset role;"); }
});

test("an order waiting for approval is decided once and its stock is released once", async () => {
  const product = (await db.query("insert into products(tenant_id,sku,name,price_retail) values($1,'P','P',100) returning id", [tenant])).rows[0].id;
  const variant = (await db.query("insert into product_variants(tenant_id,product_id,sku,stock_qty,reserved_qty) values($1,$2,'P',10,5) returning id", [tenant, product])).rows[0].id;
  const customer = (await db.query("insert into customers(tenant_id,phone) values($1,'+573000000009') on conflict (tenant_id,phone) do update set phone=excluded.phone returning id", [tenant])).rows[0].id;
  const order = async () => {
    const id = (await db.query("insert into orders(tenant_id,customer_id,order_type,status,subtotal,total) values($1,$2,'retail','pending_approval',100,100) returning id", [tenant, customer])).rows[0].id;
    await db.query("insert into order_items(tenant_id,order_id,variant_id,name_snapshot,qty,unit_price) values($1,$2,$3,'P',2,100)", [tenant, id, variant]);
    return id;
  };
  const review = (id, approve, user = owner) => db.query("select nexo_review_pending_order($1,$2,$3,$4) as v", [tenant, user, id, approve]).then(r => r.rows[0].v);
  const rejected = await order();
  const [first, second] = await Promise.all([review(rejected, false), review(rejected, false)]);
  assert.deepEqual([first.ok, second.ok].sort(), [false, true]);
  assert.equal((await db.query("select reserved_qty from product_variants where id=$1", [variant])).rows[0].reserved_qty, 3, "released exactly once");
  assert.equal((await review(rejected, true)).reason, "processed", "a rejected order cannot be approved afterwards");
  const approved = await order();
  assert.equal((await review(approved, true)).status, "pending_payment");
  assert.equal((await review(approved, false)).ok, false);
  assert.equal((await db.query("select reserved_qty from product_variants where id=$1", [variant])).rows[0].reserved_qty, 3);
  await assert.rejects(review(await order(), false, viewer), /order_forbidden/);
});
