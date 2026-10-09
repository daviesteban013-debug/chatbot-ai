import assert from "node:assert/strict";
import { before, beforeEach, after, afterEach, test } from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const tenant=crypto.randomUUID(),otherTenant=crypto.randomUUID(),user=crypto.randomUUID(),otherUser=crypto.randomUUID(),customer=crypto.randomUUID(),otherCustomer=crypto.randomUUID(),product=crypto.randomUUID(),variant=crypto.randomUUID();
let db;
before(async()=>{
  db=new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`);
  const dir=new URL("../../supabase/migrations/",import.meta.url);
  for(const file of (await readdir(dir)).filter(f=>f.endsWith('.sql')).sort()) await db.exec((await readFile(new URL(file,dir),'utf8')).replace('create extension if not exists pgcrypto;',''));
  // Supabase supplies default grants for its pre-existing tenant_members table.
  await db.exec('grant select on public.tenant_members to authenticated');
  await db.query("insert into auth.users values($1),($2)",[user,otherUser]);
  await db.query("insert into tenants(id,name,slug) values($1,'A','a'),($2,'B','b')",[tenant,otherTenant]);
  await db.query("insert into tenant_members(tenant_id,user_id) values($1,$2),($3,$4)",[tenant,user,otherTenant,otherUser]);
  await db.query("insert into customers(id,tenant_id,phone,name) values($1,$2,'fixture','Ana'),($3,$4,'fixture','Otro')",[customer,tenant,otherCustomer,otherTenant]);
  await db.query("insert into products(id,tenant_id,sku,name,price_retail) values($1,$2,'P1','Producto',12000)",[product,tenant]);
  await db.query("insert into product_variants(id,tenant_id,product_id,sku,stock_qty) values($1,$2,$3,'SKU-1',10)",[variant,tenant,product]);
  await db.query("insert into jarvis_sessions(session_id,user_id,tenant_id) values('session-order',$1,$2)",[user,tenant]);
});
beforeEach(async()=>{await db.exec('begin;');});
afterEach(async()=>{await db.exec('rollback; reset role;');});
after(async()=>{await db?.close();});
const prepare=async(items=[{variant_sku:'SKU-1',qty:2}],customerId=customer,uid=user)=>(await db.query("select nexo_prepare_order($1,$2,'session-order',$3,$4::jsonb) as r",[tenant,uid,customerId,JSON.stringify(items)])).rows[0].r.proposal;
const decide=async(id,decision='confirm',uid=user)=>(await db.query('select nexo_decide_order($1,$2,$3) as r',[id,uid,decision])).rows[0].r;
const counts=async()=>(await db.query('select (select count(*)::int from orders) as orders,(select reserved_qty from product_variants limit 1) as reserved,(select count(*)::int from handoffs) as handoffs')).rows[0];

test('preparation uses DB prices, creates no order/reservation and reuses an identical pending proposal',async()=>{
 const a=await prepare(),b=await prepare();assert.equal(a.id,b.id);assert.equal(a.snapshot.total,24000);assert.equal(a.snapshot.items[0].unit_price,12000);assert.deepEqual(await counts(),{orders:0,reserved:0,handoffs:0});
});
test('confirmation reserves once, creates a draft with pending payment/shipping; retries return same order',async()=>{
 const p=await prepare();const a=await decide(p.id),b=await decide(p.id);assert.equal(a.ok,true);assert.equal(a.proposal.status,'confirmed');assert.equal(a.proposal.order_id,b.proposal.order_id);assert.deepEqual(await counts(),{orders:1,reserved:2,handoffs:0});
 const order=(await db.query('select status,payment_status,shipping_address,total,created_by from orders')).rows[0];assert.deepEqual(order,{status:'draft',payment_status:'pending',shipping_address:null,total:24000,created_by:'human'});
 assert.equal((await db.query('select qty from order_items')).rows[0].qty,2);
});
test('price/stock/product changes fail before any writes',async()=>{
 const p=await prepare();await db.exec('update products set price_retail=13000');assert.equal((await decide(p.id)).code,'price_changed');
 await db.exec('update products set price_retail=12000;update product_variants set stock_qty=1');assert.equal((await decide(p.id)).code,'stock_changed');
 await db.exec('update product_variants set stock_qty=10,active=false');assert.equal((await decide(p.id)).code,'product_changed');assert.deepEqual(await counts(),{orders:0,reserved:0,handoffs:0});
});
test('an insertion failure rolls back the order AND stock reservation',async()=>{
 const p=await prepare();await db.exec("create function fail_item() returns trigger language plpgsql as $$begin raise exception 'fixture';end$$;create trigger fail_insert before insert on order_items for each row execute function fail_item();savepoint failure;");
 await assert.rejects(decide(p.id),/fixture/);await db.exec('rollback to savepoint failure');assert.deepEqual(await counts(),{orders:0,reserved:0,handoffs:0});
 assert.equal((await db.query('select status from nexo_order_proposals')).rows[0].status,'pending');
});
test('expiry and cancellation cannot later confirm or handoff',async()=>{
 const p=await prepare();await db.query("update nexo_order_proposals set expires_at=now()-interval '1 second' where id=$1",[p.id]);assert.equal((await decide(p.id)).proposal.status,'expired');
 const q=await prepare();assert.equal((await decide(q.id,'cancel')).proposal.status,'canceled');assert.equal((await decide(q.id)).proposal.status,'canceled');assert.equal((await decide(q.id,'handoff')).proposal.status,'canceled');assert.deepEqual(await counts(),{orders:0,reserved:0,handoffs:0});
});
test('explicit handoff carries customer and item context, assigns actor and never reserves stock',async()=>{
 const p=await prepare(),a=await decide(p.id,'handoff'),b=await decide(p.id,'handoff');assert.equal(a.proposal.status,'handed_off');assert.equal(a.proposal.handoff_id,b.proposal.handoff_id);
 const h=(await db.query('select h.status,h.taken_by,h.summary,c.assigned_to,c.customer_id from handoffs h join conversations c on c.id=h.conversation_id')).rows[0];assert.equal(h.status,'taken');assert.equal(h.taken_by,user);assert.equal(h.assigned_to,user);assert.equal(h.customer_id,customer);assert.match(h.summary,/SKU-1/);assert.match(h.summary,/24000/);assert.deepEqual(await counts(),{orders:0,reserved:0,handoffs:1});
});
test('foreign customer, user, role and malformed quantities cannot prepare proposals',async()=>{
 await db.exec('savepoint denied');
 for(const operation of [()=>prepare(undefined,otherCustomer),()=>prepare(undefined,customer,otherUser),()=>prepare([{variant_sku:'UNKNOWN',qty:1}]),()=>prepare([{variant_sku:'SKU-1',qty:0}]),()=>prepare([{variant_sku:'SKU-1',qty:2},{variant_sku:'SKU-1',qty:1}])]) {
  await assert.rejects(operation());await db.exec('rollback to savepoint denied');
 }
 await db.exec("update tenant_members set role='viewer';savepoint viewer");await assert.rejects(prepare(),/NEXO_FORBIDDEN/);await db.exec('rollback to savepoint viewer');
});
test('foreign user and revoked membership cannot confirm an owned proposal',async()=>{
 const p=await prepare();await db.exec('savepoint denied');await assert.rejects(decide(p.id,'confirm',otherUser),/NEXO_FORBIDDEN/);await db.exec('rollback to savepoint denied');
 await db.exec("update tenant_members set role='viewer';savepoint viewer");await assert.rejects(decide(p.id),/NEXO_FORBIDDEN/);await db.exec('rollback to savepoint viewer');assert.deepEqual(await counts(),{orders:0,reserved:0,handoffs:0});
});
test('RLS isolates proposals; anon/authenticated cannot execute either RPC or mutate proposals',async()=>{
 const p=await prepare();await db.query("select set_config('request.jwt.claim.sub',$1,true)",[otherUser]);await db.exec('set local role authenticated;');assert.equal((await db.query('select id from nexo_order_proposals')).rows.length,0);
 await db.query("select set_config('request.jwt.claim.sub',$1,true)",[user]);assert.equal((await db.query('select id from nexo_order_proposals')).rows[0].id,p.id);
 for(const role of ['authenticated','anon']) {await db.exec(`reset role;set local role ${role};savepoint denied`);
  for(const operation of [()=>prepare(),()=>decide(p.id),()=>db.exec("update nexo_order_proposals set status='confirmed'")]) {await assert.rejects(operation(),/permission denied/);await db.exec('rollback to savepoint denied');}
 }
});
