import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";

const tenant = "11111111-1111-4111-8111-111111111111";
const owner = "33333333-3333-4333-8333-333333333333";
const viewer = "44444444-4444-4444-8444-444444444444";
const session = "session-catalog-1";
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
  await db.query("insert into auth.users(id) values ($1),($2)", [owner, viewer]);
  await db.query("insert into tenants(id,name,slug) values ($1,'A','a')", [tenant]);
  await db.query("insert into tenant_members(tenant_id,user_id,role) values ($1,$2,'owner'),($1,$3,'viewer')", [tenant, owner, viewer]);
  await db.query("insert into jarvis_sessions(session_id,user_id,tenant_id) values ($1,$2,$3)", [session, owner, tenant]);
});
after(async () => { await db?.close(); });
beforeEach(async () => { await db.exec("reset role; delete from nexo_catalog_proposals; delete from order_items; delete from orders; delete from handoffs; delete from product_variants; delete from products;"); });

const save = product => db.query("select nexo_save_product($1,$2,$3) as v", [tenant, owner, product]).then(r => r.rows[0].v);
const prepare = (change, user = owner) => db.query("select nexo_prepare_catalog_change($1,$2,$3,$4) as v", [tenant, user, session, change]).then(r => r.rows[0].v.proposal);
const decide = (id, decision = "confirm", image = null) => db.query("select nexo_decide_catalog_change($1,$2,$3,$4) as v", [id, owner, decision, image]).then(r => r.rows[0].v);
const stock = sku => db.query("select stock_qty from product_variants where sku=$1", [sku]).then(r => r.rows[0].stock_qty);

test("a stock change shows before → after and applies only on confirmation", async () => {
  await save({ name: "Tenis Urban", price_retail: 189000, variants: [{ color: "Blanco", size: "40", stock_qty: 2 }] });
  const proposal = await prepare({ action: "stock", items: [{ sku: "TENIS-URBAN-BLANCO-40", mode: "add", qty: 20 }] });
  assert.equal(proposal.status, "pending");
  assert.deepEqual([proposal.snapshot.lines[0].before, proposal.snapshot.lines[0].after], [2, 22]);
  assert.equal(await stock("TENIS-URBAN-BLANCO-40"), 2, "preparing never writes");
  assert.equal((await prepare({ action: "stock", items: [{ sku: "TENIS-URBAN-BLANCO-40", mode: "add", qty: 20 }] })).id, proposal.id, "the same request is not duplicated");
  const result = await decide(proposal.id);
  assert.equal(result.ok, true); assert.equal(result.proposal.status, "applied");
  assert.equal(await stock("TENIS-URBAN-BLANCO-40"), 22);
  assert.equal((await decide(proposal.id)).code, "decided", "a second click does nothing");
  assert.equal(await stock("TENIS-URBAN-BLANCO-40"), 22);
});

test("nothing applies if the catalog changed after the proposal was prepared", async () => {
  await save({ name: "Gorra", price_retail: 35000 });
  const proposal = await prepare({ action: "price", items: [{ sku: "GORRA", price: 39000 }] });
  await db.query("update products set price_retail=36000 where sku='GORRA'");
  const result = await decide(proposal.id);
  assert.equal(result.ok, false); assert.equal(result.code, "changed");
  assert.equal((await db.query("select price_retail from products where sku='GORRA'")).rows[0].price_retail, 36000);
});

test("percentage price changes round to $100, and availability and reserved stock are respected", async () => {
  await save({ name: "Chaqueta Bomber", price_retail: 149000 });
  await save({ name: "Chaqueta Jean", price_retail: 99900 });
  const prices = await prepare({ action: "price", percent: 10, items: [{ sku: "CHAQUETA-BOMBER" }, { sku: "CHAQUETA-JEAN" }] });
  assert.deepEqual(prices.snapshot.lines.map(l => [l.before, l.after]), [[149000, 163900], [99900, 109900]]);
  await decide(prices.id);
  assert.deepEqual((await db.query("select price_retail from products order by sku")).rows.map(r => r.price_retail), [163900, 109900]);
  const hide = await prepare({ action: "availability", items: [{ sku: "CHAQUETA-JEAN", active: false }] });
  await decide(hide.id);
  assert.equal((await db.query("select active from products where sku='CHAQUETA-JEAN'")).rows[0].active, false);
  await db.query("update product_variants set stock_qty=5, reserved_qty=3 where sku='CHAQUETA-BOMBER'");
  await assert.rejects(prepare({ action: "stock", items: [{ sku: "CHAQUETA-BOMBER", mode: "set", qty: 2 }] }), /CATALOG_RESERVED/);
  await assert.rejects(prepare({ action: "stock", items: [{ sku: "NO-EXISTE", mode: "set", qty: 2 }] }), /CATALOG_SKU/);
});

test("a new product is created on confirmation, optionally with the photo attached in this conversation", async () => {
  const fileId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  await db.query("insert into jarvis_files(id,user_id,session_id,filename,object_path,mime_type,byte_size,status) values($1,$2,$3,'tenis.jpg',$4,'image/jpeg',100,'ready')", [fileId, owner, session, `${owner}/${fileId}`]);
  const proposal = await prepare({ action: "create", attachment_id: fileId, product: { name: "Tenis Runner", price_retail: 159000, category: "Tenis", variants: [{ size: "38", stock_qty: 3 }, { size: "39", stock_qty: 4 }] } });
  assert.equal(proposal.snapshot.attachment_id, fileId);
  assert.equal((await db.query("select count(*)::int as n from products")).rows[0].n, 0);
  const result = await decide(proposal.id, "confirm", "https://x.supabase.co/storage/v1/object/public/product-images/a.jpg");
  const product = (await db.query("select id,name,price_retail,image_url from products")).rows[0];
  assert.equal(result.proposal.product_id, product.id);
  assert.deepEqual([product.name, product.price_retail, product.image_url], ["Tenis Runner", 159000, "https://x.supabase.co/storage/v1/object/public/product-images/a.jpg"]);
  assert.equal((await db.query("select sum(stock_qty)::int as n from product_variants")).rows[0].n, 7);
  await assert.rejects(prepare({ action: "create", attachment_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", product: { name: "X", price_retail: 1 } }), /CATALOG_PHOTO/);
});

test("only owners and agents prepare changes; browsers cannot call the functions; cancel writes nothing", async () => {
  await save({ name: "Bolso", price_retail: 100000 });
  await assert.rejects(prepare({ action: "price", items: [{ sku: "BOLSO", price: 1 }] }, viewer), /CATALOG_FORBIDDEN/);
  const proposal = await prepare({ action: "price", items: [{ sku: "BOLSO", price: 120000 }] });
  assert.equal((await decide(proposal.id, "cancel")).proposal.status, "canceled");
  assert.equal((await db.query("select price_retail from products where sku='BOLSO'")).rows[0].price_retail, 100000);
  await db.exec("set role authenticated;");
  try {
    await assert.rejects(prepare({ action: "price", items: [{ sku: "BOLSO", price: 1 }] }), /permission denied/);
    await assert.rejects(db.query("select nexo_daily_briefing($1,$2)", [tenant, owner]), /permission denied/);
  } finally { await db.exec("reset role;"); }
});

test("the daily briefing reports yesterday's sales, unpaid orders, waiting customers and low stock", async () => {
  await save({ name: "Gorra", price_retail: 35000, variants: [{ color: "Negra", stock_qty: 1 }] });
  const customer = (await db.query("insert into customers(tenant_id,phone,name) values($1,'+573001112233','María') on conflict (tenant_id,phone) do update set name='María' returning id", [tenant])).rows[0].id;
  const conversation = (await db.query("insert into conversations(tenant_id,customer_id) values($1,$2) returning id", [tenant, customer])).rows[0].id;
  await db.query(`insert into orders(tenant_id,conversation_id,customer_id,status,payment_status,total,subtotal,created_at)
    values($1,$2,$3,'pending_payment','pending',120000,120000, date_trunc('day', now() at time zone 'America/Bogota') at time zone 'America/Bogota' - interval '12 hours')`, [tenant, conversation, customer]);
  await db.query("insert into handoffs(tenant_id,conversation_id,reason,summary) values($1,$2,'otro','x')", [tenant, conversation]);
  const briefing = (await db.query("select nexo_daily_briefing($1,$2) as v", [tenant, viewer])).rows[0].v;
  assert.deepEqual([briefing.yesterday.orders, briefing.yesterday.sales], [1, 120000]);
  assert.deepEqual([briefing.unpaid.count, briefing.unpaid.total], [1, 120000]);
  assert.deepEqual([briefing.handoffs.count, briefing.handoffs.customer], [1, "María"]);
  assert.equal(briefing.lowStock.count, 1);
  assert.equal(briefing.lowStock.items[0].name, "Gorra · Negra");
  await assert.rejects(db.query("select nexo_daily_briefing($1,'55555555-5555-4555-8555-555555555555')", [tenant]), /briefing_forbidden/);
  const period = (await db.query("select nexo_sales_period($1,'yesterday') as v", [tenant])).rows[0].v;
  assert.equal(period.current.sales, 120000);
  await assert.rejects(db.query("select nexo_sales_period($1,'14')", [tenant]), /metrics_invalid/);
});
