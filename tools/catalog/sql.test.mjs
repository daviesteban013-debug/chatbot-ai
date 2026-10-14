import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";

const tenant = "11111111-1111-4111-8111-111111111111";
const otherTenant = "22222222-2222-4222-8222-222222222222";
const owner = "33333333-3333-4333-8333-333333333333";
const viewer = "44444444-4444-4444-8444-444444444444";
const agent = "55555555-5555-4555-8555-555555555555";
let db;
before(async () => {
  db = new PGlite({ extensions: { vector } });
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid; $$;
    grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
    create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit integer);`);
  const dir = new URL("../../supabase/migrations/", import.meta.url);
  for (const file of (await readdir(dir)).filter(f => f.endsWith(".sql")).sort())
    await db.exec((await readFile(new URL(file, dir), "utf8")).replace("create extension if not exists pgcrypto;", ""));
  await db.query("insert into auth.users(id) values ($1),($2),($3)", [owner, viewer, agent]);
  await db.query("insert into tenants(id,name,slug) values ($1,'A','a'),($2,'B','b')", [tenant, otherTenant]);
  await db.query("insert into tenant_members(tenant_id,user_id,role) values ($1,$2,'owner'),($1,$3,'viewer'),($1,$4,'agent')", [tenant, owner, viewer, agent]);
});
after(async () => { await db?.close(); });
beforeEach(async () => { await db.exec("reset role; delete from order_items; delete from orders; delete from product_variants; delete from products;"); });

const save = async (product, user = owner, t = tenant) => (await db.query("select nexo_save_product($1,$2,$3) as v", [t, user, product])).rows[0].v;
const importAll = async (products, mode = "merge", user = owner) => (await db.query("select nexo_import_products($1,$2,$3,$4) as v", [tenant, user, JSON.stringify(products), mode])).rows[0].v;
const variants = async id => (await db.query("select sku,color,size,stock_qty,active from product_variants where product_id=$1 order by sku", [id])).rows;

test("the public bucket for product photos exists and the editor needs owner or agent", async () => {
  assert.deepEqual((await db.query("select public,file_size_limit from storage.buckets where id='product-images'")).rows[0], { public: true, file_size_limit: 5242880 });
  await assert.rejects(save({ name: "Bolso", price_retail: 1000 }, viewer), /catalog_forbidden/);
  await assert.rejects(save({ name: "Bolso", price_retail: 1000 }, owner, otherTenant), /catalog_forbidden/);
  assert.equal((await save({ name: "Bolso", price_retail: 1000 }, agent)).status, "created");
  await db.exec("set role authenticated;");
  try {
    await assert.rejects(save({ name: "X", price_retail: 1 }), /permission denied/);
    await assert.rejects(db.query("insert into products(tenant_id,sku,name,price_retail) values($1,'A','A',1)", [tenant]), /permission denied/);
  } finally { await db.exec("reset role;"); }
});

test("a simple product gets a generated SKU and one sellable variant", async () => {
  const a = await save({ name: "Chaqueta Bómber Negra", price_retail: 149000, category: "Chaquetas" });
  assert.equal(a.sku, "CHAQUETA-BOMBER-NEGRA");
  assert.deepEqual(await variants(a.id), [{ sku: "CHAQUETA-BOMBER-NEGRA", color: null, size: null, stock_qty: 0, active: true }]);
  const b = await save({ name: "Chaqueta bómber negra", price_retail: 1 });
  assert.equal(b.sku, "CHAQUETA-BOMBER-NEGRA-2", "generated SKUs never collide");
  await assert.rejects(save({ name: "Otra", price_retail: 1, sku: a.sku }), /catalog_sku_taken/);
  await assert.rejects(save({ name: "Mal", price_retail: -5 }), /catalog_invalid_price/);
  await assert.rejects(save({ name: "Mal", price_retail: 10.5 }), /catalog_invalid_price/);
  await assert.rejects(save({ name: "Mal", price_retail: 1, image_url: "http://x.test/a.jpg" }), /catalog_invalid_image/);
});

test("the editor replaces variants; sold or reserved variants are archived instead of deleted", async () => {
  const p = await save({ name: "Tenis Urban", price_retail: 189000, variants: [
    { color: "Negro", size: "40", stock_qty: 2 }, { color: "Blanco", size: "40", stock_qty: 1 }, { color: "Blanco", size: "41", stock_qty: 0 }] });
  const rows = await variants(p.id);
  assert.deepEqual(rows.map(r => r.sku), ["TENIS-URBAN-BLANCO-40", "TENIS-URBAN-BLANCO-41", "TENIS-URBAN-NEGRO-40"]);
  const sold = (await db.query("select id from product_variants where sku='TENIS-URBAN-NEGRO-40'")).rows[0].id;
  const customer = (await db.query("insert into customers(tenant_id,phone) values($1,'+573000000000') returning id", [tenant])).rows[0].id;
  const order = (await db.query("insert into orders(tenant_id,customer_id,order_type,status,subtotal,total) values($1,$2,'retail','confirmed',1,1) returning id", [tenant, customer])).rows[0].id;
  await db.query("insert into order_items(tenant_id,order_id,variant_id,name_snapshot,qty,unit_price) values($1,$2,$3,'x',1,1)", [tenant, order, sold]);
  await db.query("update product_variants set reserved_qty=1 where sku='TENIS-URBAN-BLANCO-40'");
  await save({ id: p.id, name: "Tenis Urban", price_retail: 199000, variants: [{ color: "Blanco", size: "41", stock_qty: 5 }] });
  assert.deepEqual((await variants(p.id)).map(r => [r.sku, r.active, r.stock_qty]),
    [["TENIS-URBAN-BLANCO-40", false, 1], ["TENIS-URBAN-BLANCO-41", true, 5], ["TENIS-URBAN-NEGRO-40", false, 2]]);
  await assert.rejects(save({ id: p.id, variants: [{ sku: "TENIS-URBAN-BLANCO-40", stock_qty: 0 }] }), /catalog_stock_below_reserved/);
  await assert.rejects(save({ id: p.id, name: "X" }, owner, otherTenant), /catalog_forbidden/);
});

test("imports merge by SKU or name, keep fields they don't send and report invalid rows without undoing the rest", async () => {
  const existing = await save({ name: "Bolso Tote", sku: "TOTE-01", price_retail: 100000, description: "Cuero", variants: [{ color: "Negro", stock_qty: 3 }] });
  const result = await importAll([
    { sku: "TOTE-01", name: "Bolso Tote", price_retail: 120000, variants: [{ color: "Negro", stock_qty: 9 }, { color: "Café", stock_qty: 4 }] },
    { name: "Gorra Básica", price_retail: 35000, variants: [{ size: "Única", stock_qty: 10 }] },
    { name: "Sin precio" },
    { name: "Precio negativo", price_retail: -1 },
  ]);
  assert.deepEqual([result.created, result.updated, result.skipped], [1, 1, 2]);
  assert.deepEqual(result.results.slice(2).map(r => r.reason), ["catalog_invalid_price", "catalog_invalid_price"]);
  const tote = (await db.query("select price_retail,description from products where id=$1", [existing.id])).rows[0];
  assert.deepEqual(tote, { price_retail: 120000, description: "Cuero" });
  assert.deepEqual((await variants(existing.id)).map(r => [r.color, r.stock_qty]), [["Café", 4], ["Negro", 9]]);
  const again = await importAll([{ name: "gorra básica", price_retail: 1 }], "only_new");
  assert.equal(again.skipped, 1, "only_new never touches an existing product");
  await assert.rejects(importAll([{ name: "X", price_retail: 1 }], "merge", viewer), /catalog_forbidden/);
  await assert.rejects(importAll(Array.from({ length: 501 }, (_, i) => ({ name: `P${i}`, price_retail: 1 }))), /catalog_invalid/);
});

test("archiving deletes unsold products and keeps sold ones for order history", async () => {
  const unsold = await save({ name: "Muestra", price_retail: 1 });
  assert.equal((await db.query("select nexo_archive_product($1,$2,$3) as v", [tenant, agent, unsold.id])).rows[0].v.status, "deleted");
  const sold = await save({ name: "Vendido", price_retail: 1 });
  await db.query("update product_variants set reserved_qty=0, stock_qty=1 where product_id=$1", [sold.id]);
  const variant = (await db.query("select id from product_variants where product_id=$1", [sold.id])).rows[0].id;
  const customer = (await db.query("insert into customers(tenant_id,phone) values($1,'+573000000001') returning id", [tenant])).rows[0].id;
  const order = (await db.query("insert into orders(tenant_id,customer_id,order_type,status,subtotal,total) values($1,$2,'retail','confirmed',1,1) returning id", [tenant, customer])).rows[0].id;
  await db.query("insert into order_items(tenant_id,order_id,variant_id,name_snapshot,qty,unit_price) values($1,$2,$3,'x',1,1)", [tenant, order, variant]);
  assert.equal((await db.query("select nexo_archive_product($1,$2,$3) as v", [tenant, owner, sold.id])).rows[0].v.status, "archived");
  assert.equal((await db.query("select active from products where id=$1", [sold.id])).rows[0].active, false);
  await assert.rejects(db.query("select nexo_archive_product($1,$2,$3)", [tenant, viewer, sold.id]), /catalog_forbidden/);
});
