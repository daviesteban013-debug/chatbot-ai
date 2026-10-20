import assert from 'node:assert/strict';
import {before,beforeEach,afterEach,after,test} from 'node:test';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {vector} from '@electric-sql/pglite-pgvector';
const tenant=crypto.randomUUID(),other=crypto.randomUUID(),owner=crypto.randomUUID(),operator=crypto.randomUUID(),viewer=crypto.randomUUID(),personal=crypto.randomUUID();
const customer=crypto.randomUUID(),conversation=crypto.randomUUID(),order=crypto.randomUUID(),product=crypto.randomUUID(),variant=crypto.randomUUID();
let db;
before(async()=>{
 db=new PGlite({extensions:{vector}});
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to authenticated,service_role;grant execute on function auth.uid() to authenticated,service_role;`);
 const dir=new URL('../../supabase/migrations/',import.meta.url);
 for(const f of(await readdir(dir)).filter(f=>f.endsWith('.sql')).sort())await db.exec((await readFile(new URL(f,dir),'utf8')).replace('create extension if not exists pgcrypto;',''));
 // Ordinary Supabase server privileges; browser writes stay revoked by migration.
 await db.exec('grant all on all tables in schema public to service_role;grant select on tenants,tenant_members,products,product_variants,customers,conversations,orders,order_items,handoffs,agent_runs,eval_cases,eval_results,agents,messages to authenticated;');
 await db.query('insert into auth.users values($1),($2),($3),($4)',[owner,operator,viewer,personal]);
 await db.query("insert into tenants(id,name,slug) values($1,'Fixture','permissions-fixture'),($2,'Other','permissions-other')",[tenant,other]);
 await db.query("insert into tenant_members(tenant_id,user_id,role) values($1,$2,'owner'),($1,$3,'agent'),($1,$4,'viewer')",[tenant,owner,operator,viewer]);
 await db.query("insert into customers(id,tenant_id,phone) values($1,$2,'573000000000')",[customer,tenant]);
 await db.query('insert into conversations(id,tenant_id,customer_id) values($1,$2,$3)',[conversation,tenant,customer]);
 await db.query("insert into orders(id,tenant_id,customer_id,conversation_id,status,total,payment_status) values($1,$2,$3,$4,'pending_payment',100000,'pending')",[order,tenant,customer,conversation]);
 await db.query("insert into products(id,tenant_id,sku,name,price_retail) values($1,$2,'P','Fixture',100000)",[product,tenant]);
 await db.query("insert into product_variants(id,tenant_id,product_id,sku,stock_qty,reserved_qty) values($1,$2,$3,'SKU',10,3)",[variant,tenant,product]);
 await db.query("insert into jarvis_configs(tenant_id,config) values($1,'{}'),($2,'{}')",[tenant,other]);
});
beforeEach(async()=>db.exec('begin'));
afterEach(async()=>db.exec('rollback;reset role'));
after(async()=>db?.close());
const result=async(sql,args)=>(await db.query(sql,args)).rows[0].r;
const reserve=(user=owner,scope=tenant,units=100,channel='tts',id=crypto.randomUUID())=>result('select nexo_reserve_voice($1,$2,$3,$4,$5) r',[id,user,scope,channel,units]);
const finish=(id,user=owner,outcome='completed')=>db.query('select nexo_finish_voice($1,$2,$3)',[id,user,outcome]);
const resetRate=(user=owner,channel='tts')=>db.query("update nexo_voice_callers set slots=3,last_refill_at=now()-interval '10 seconds' where user_id=$1 and channel=$2",[user,channel]);
const denied=async(fn,pattern)=>{await db.exec('savepoint denied');await assert.rejects(fn,pattern);await db.exec('rollback to savepoint denied');};
async function browser(user){await db.query("select set_config('request.jwt.claim.sub',$1,true)",[user]);await db.exec('set local role authenticated');}

test('a viewer cannot forge payment, inventory, customer data or the action ledger through direct API writes',async()=>{
 await browser(viewer);
 for(const table of ['products','product_variants','customers','conversations','orders','order_items','handoffs','agent_runs','eval_cases','eval_results','agents','messages']){
  for(const privilege of ['INSERT','UPDATE','DELETE'])assert.equal((await db.query('select has_table_privilege(current_user,$1,$2) ok',[table,privilege])).rows[0].ok,false,`${table} ${privilege}`);
 }
 await denied(()=>db.query("update orders set payment_status='paid' where id=$1",[order]),/permission denied/);
 await denied(()=>db.query('update product_variants set stock_qty=999 where id=$1',[variant]),/permission denied/);
 await denied(()=>db.exec('delete from agent_runs'),/permission denied/);
 assert.equal((await db.query('select payment_status from orders where id=$1',[order])).rows[0].payment_status,'pending');
});
test('members retain own-business reads and foreign businesses remain invisible; server writes still work',async()=>{
 for(const user of [owner,operator,viewer]){
  await db.exec('reset role');await browser(user);
  assert.equal((await db.query('select count(*)::int n from orders')).rows[0].n,1);
  assert.equal((await db.query('select count(*)::int n from jarvis_configs')).rows[0].n,1);
 }
 await db.exec('reset role;set local role service_role');
 await db.query("update orders set status='confirmed' where id=$1",[order]);
 assert.equal((await db.query('select status from orders where id=$1',[order])).rows[0].status,'confirmed');
});
test('only the current owner can change tenant-wide Zorax configuration; forged JWT role does not override membership',async()=>{
 for(const user of [viewer,operator]){
  await db.exec('reset role');await browser(user);
  await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:user,role:'authenticated',user_metadata:{role:'owner'}})]);
  assert.equal((await db.query("update jarvis_configs set config='{"+'"name":"Forged"'+"}' where tenant_id=$1 returning tenant_id",[tenant])).rows.length,0);
  await denied(()=>db.query("insert into jarvis_configs(tenant_id,config) values($1,'{}')",[other]),/row-level security/);
 }
 await db.exec('reset role');await browser(owner);
 assert.equal((await db.query("update jarvis_configs set config='{"+'"name":"Zorax"'+"}' where tenant_id=$1 returning tenant_id",[tenant])).rows.length,1);
 await denied(()=>db.query('update jarvis_configs set tenant_id=$1 where tenant_id=$2',[other,tenant]),/row-level security/);
});
test('stock RPCs are server-only, use a fixed search path and reject negative or zero quantities',async()=>{
 for(const role of ['anon','authenticated'])for(const signature of ['reserve_variant_stock(uuid,integer)','release_variant_stock(uuid,integer)','nexo_reserve_voice(uuid,uuid,uuid,text,integer)','nexo_finish_voice(uuid,uuid,text)'])
  assert.equal((await db.query('select has_function_privilege($1,$2,\'EXECUTE\') ok',[role,signature])).rows[0].ok,false);
 await db.exec('set local role service_role');
 for(const qty of [0,-1])for(const name of ['reserve_variant_stock','release_variant_stock'])await denied(()=>db.query(`select ${name}($1,$2)`,[variant,qty]),/STOCK_INVALID_QUANTITY/);
 assert.equal((await db.query('select reserve_variant_stock($1,2) ok',[variant])).rows[0].ok,true);
 await db.query('select release_variant_stock($1,2)',[variant]);
 assert.equal((await db.query('select reserved_qty from product_variants where id=$1',[variant])).rows[0].reserved_qty,3);
});
test('no browser role can read, fabricate or delete durable voice counters or reservations',async()=>{
 for(const role of ['anon','authenticated'])for(const table of ['nexo_voice_buckets','nexo_voice_callers','nexo_voice_requests'])for(const privilege of ['SELECT','INSERT','UPDATE','DELETE'])
  assert.equal((await db.query('select has_table_privilege($1,$2,$3) ok',[role,table,privilege])).rows[0].ok,false);
 const functions=(await db.query("select prosecdef,proconfig from pg_proc where pronamespace='public'::regnamespace and proname in ('nexo_reserve_voice','nexo_finish_voice','nexo_prune_voice_usage')")).rows;
 for(const f of functions){assert.equal(f.prosecdef,false);assert.ok(f.proconfig.includes('search_path=""'));}
});
test('different users/instances compete for one business quota without exceeding it',async()=>{
 await db.exec('set local role service_role');
 await db.query("insert into nexo_voice_buckets(owner_key,channel,used_units) values($1,'tts',19000)",['tenant:'+tenant]);
 const attempts=await Promise.all([reserve(owner,tenant,1000),reserve(operator,tenant,1000)]);
 assert.equal(attempts.filter(a=>a.ok).length,1);assert.equal(attempts.find(a=>!a.ok).reason,'quota');
 assert.equal((await db.query('select used_units from nexo_voice_buckets')).rows[0].used_units,20000);
});
test('concurrent same-user calls get one active lease, and a separate business has its own quota',async()=>{
 await db.exec('set local role service_role');
 const attempts=await Promise.all([reserve(),reserve()]);assert.equal(attempts.filter(a=>a.ok).length,1);assert.equal(attempts.find(a=>!a.ok).reason,'busy');
 const separate=await reserve(personal,null,4000);assert.equal(separate.ok,true);
 await finish(attempts.find(a=>a.ok).requestId);assert.equal((await reserve()).ok,true);
});
test('unknown outcomes and errors do not refund potentially billed work, completion is idempotent',async()=>{
 await db.exec('set local role service_role');
 const r=await reserve(owner,tenant,4000);await finish(r.requestId,owner,'unknown');await finish(r.requestId,owner,'completed');
 assert.equal((await db.query('select used_units from nexo_voice_buckets')).rows[0].used_units,4000);
 assert.equal((await db.query('select state from nexo_voice_requests')).rows[0].state,'unknown');
 await denied(()=>finish(r.requestId,viewer),/VOICE_REQUEST_NOT_FOUND/);
});
test('expiration recovers stuck concurrency and a late completion cannot release a newer reservation',async()=>{
 await db.exec('set local role service_role');
 const a=await reserve();await db.exec("update nexo_voice_callers set active_until=now()-interval '1 second'");
 const b=await reserve();assert.equal(b.ok,true);await finish(a.requestId);
 assert.equal((await reserve()).reason,'busy');
 assert.equal((await db.query('select state from nexo_voice_requests where id=$1',[a.requestId])).rows[0].state,'expired');
 assert.equal((await db.query('select active_request from nexo_voice_callers')).rows[0].active_request,b.requestId);
});
test('short sentence bursts are bounded and refill after two seconds',async()=>{
 await db.exec('set local role service_role');
 for(let i=0;i<3;i++){const r=await reserve();assert.equal(r.ok,true);await finish(r.requestId);}
 const exhausted=await reserve();assert.equal(exhausted.reason,'rate');assert.ok(exhausted.retryAfterSeconds<=2);
 await db.exec("update nexo_voice_callers set last_refill_at=now()-interval '3 seconds'");assert.equal((await reserve()).ok,true);
});
test('character exhaustion returns recovery time and a new ten-minute window starts fresh',async()=>{
 await db.exec('set local role service_role');
 for(let i=0;i<5;i++){const r=await reserve(owner,tenant,4000);assert.equal(r.ok,true);await finish(r.requestId);await resetRate();}
 const denied=await reserve();assert.equal(denied.reason,'quota');assert.ok(denied.retryAfterSeconds>0&&denied.retryAfterSeconds<=600);
 await db.exec("update nexo_voice_buckets set window_started_at=now()-interval '11 minutes'");
 const renewed=await reserve(owner,tenant,200);assert.equal(renewed.ok,true);assert.equal((await db.query('select used_units from nexo_voice_buckets')).rows[0].used_units,200);
});
test('transcription has a separate forty-clip quota; it cannot consume output speech allowance',async()=>{
 await db.exec('set local role service_role');
 for(let i=0;i<40;i++){const r=await reserve(owner,tenant,500,'stt');assert.equal(r.ok,true);await finish(r.requestId);await resetRate(owner,'stt');}
 assert.equal((await reserve(owner,tenant,500,'stt')).reason,'quota');assert.equal((await reserve()).ok,true);
});
test('foreign membership, suspended business, personal-bucket bypass, invalid channels and duplicate IDs fail closed',async()=>{
 await db.exec('set local role service_role');
 await denied(()=>reserve(owner,other),/VOICE_MEMBER_REQUIRED/);await denied(()=>reserve(owner,null),/VOICE_TENANT_REQUIRED/);
 await denied(()=>reserve(owner,tenant,0),/VOICE_INVALID_REQUEST/);await denied(()=>reserve(owner,tenant,4001),/VOICE_INVALID_REQUEST/);
 await denied(()=>reserve(owner,tenant,100,'stt'),/VOICE_INVALID_REQUEST/);await denied(()=>reserve(owner,tenant,100,'injected'),/VOICE_INVALID_REQUEST/);
 const id=crypto.randomUUID();await reserve(owner,tenant,100,'tts',id);await denied(()=>reserve(owner,tenant,100,'tts',id),/VOICE_DUPLICATE_REQUEST/);
 await db.query("update tenants set status='suspended' where id=$1",[tenant]);await denied(()=>reserve(viewer),/VOICE_MEMBER_REQUIRED/);
});
