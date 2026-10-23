import assert from "node:assert/strict";
import {before,after,beforeEach,afterEach,test} from "node:test";
import {readFile,readdir} from "node:fs/promises";
import {PGlite} from "@electric-sql/pglite";
import {vector} from "@electric-sql/pglite-pgvector";
let db;
const tenant=crypto.randomUUID(),other=crypto.randomUUID(),owner=crypto.randomUUID(),viewer=crypto.randomUUID(),outsider=crypto.randomUUID();
const ciphertext=`wa.v1.${'a'.repeat(16)}.${'b'.repeat(22)}.${'c'.repeat(40)}`;
before(async()=>{
 db=new PGlite({extensions:{vector}});
 await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth;create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`);
 const dir=new URL('../../supabase/migrations/',import.meta.url);
 for(const file of(await readdir(dir)).filter(f=>f.endsWith('.sql')).sort()) await db.exec((await readFile(new URL(file,dir),'utf8')).replace('create extension if not exists pgcrypto;',''));
 await db.exec('grant select on tenant_members to authenticated');
 await db.query('insert into auth.users values($1),($2),($3)',[owner,viewer,outsider]);
 await db.query("insert into tenants(id,name,slug) values($1,'A','wa-a'),($2,'B','wa-b')",[tenant,other]);
 await db.query("insert into tenant_members(tenant_id,user_id,role) values($1,$2,'owner'),($1,$3,'viewer'),($4,$5,'owner')",[tenant,owner,viewer,other,outsider]);
});
beforeEach(async()=>db.exec('begin'));
afterEach(async()=>db.exec('rollback;reset role'));
after(async()=>db?.close());
const save=(uid=owner,tid=tenant,phone='123456789',cipher=ciphertext)=>db.query('select configure_whatsapp_cloud($1,$2,$3,$4,$5,$6) id',[tid,uid,phone,'987654321','+573000000000',cipher]);
const denied=async(operation,pattern)=>{await db.exec('savepoint denied');await assert.rejects(operation,pattern);await db.exec('rollback to savepoint denied');};
async function asUser(uid){await db.query("select set_config('request.jwt.claim.sub',$1,true)",[uid]);await db.exec('set local role authenticated');}
test('only server can configure; owner is rechecked and raw tokens are refused',async()=>{
 await db.exec('set local role service_role');
 await denied(()=>save(viewer),/WHATSAPP_OWNER_REQUIRED/);await denied(()=>save(outsider),/WHATSAPP_OWNER_REQUIRED/);
 await denied(()=>save(owner,tenant,'123456789','raw-token'),/WHATSAPP_INVALID_CONFIG/);
 const result=await save();assert.ok(result.rows[0].id);
});
test('members can read only safe metadata, never ciphertext or SELECT *',async()=>{
 await save();await save(outsider,other,'5555566666');
 for(const uid of [owner,viewer]){
  await asUser(uid);assert.equal((await db.query('select phone_number_id from whatsapp_accounts')).rows.length,1);
  await denied(()=>db.exec('select access_token_enc from whatsapp_accounts'),/permission denied/);
  await denied(()=>db.exec('select two_step_pin_enc from whatsapp_accounts'),/permission denied/);
  await denied(()=>db.exec('select * from whatsapp_accounts'),/permission denied/);
  await denied(()=>db.exec('update whatsapp_accounts set access_token_enc=null'),/permission denied/);
  await denied(()=>save(),/permission denied/);await db.exec('reset role');
 }
 await db.exec('set local role anon');await denied(()=>db.exec('select phone_number_id from whatsapp_accounts'),/permission denied/);
});
test('one number cannot be bound to two businesses; saving is idempotent and replacement resets reception',async()=>{
 const first=(await save()).rows[0].id;await denied(()=>save(outsider,other),/unique constraint/);
 await db.query('update whatsapp_accounts set last_webhook_at=now() where tenant_id=$1',[tenant]);
 assert.equal((await save()).rows[0].id,first);
 assert.ok((await db.query('select last_webhook_at from whatsapp_accounts where tenant_id=$1',[tenant])).rows[0].last_webhook_at);
 assert.equal((await save(owner,tenant,'1111122222')).rows[0].id,first);
 assert.equal((await db.query('select last_webhook_at from whatsapp_accounts where tenant_id=$1',[tenant])).rows[0].last_webhook_at,null);
});
test('revoked membership immediately prevents configuration and metadata reads',async()=>{
 await save();await db.query('delete from tenant_members where tenant_id=$1 and user_id=$2',[tenant,owner]);
 await db.exec('set local role service_role');await denied(()=>save(),/WHATSAPP_OWNER_REQUIRED/);
 await db.exec('reset role');await asUser(owner);assert.equal((await db.query('select phone_number_id from whatsapp_accounts')).rows.length,0);
});
test('importing the linked app is per number: a new number starts clean, the same number keeps its progress, members only read the status',async()=>{
 await save();
 await db.query("update whatsapp_accounts set app_linked_at=now(),contacts_sync_requested_at=now(),history_sync_requested_at=now(),history_sync_progress=40,history_sync_declined=true where tenant_id=$1",[tenant]);
 await save();
 let row=(await db.query('select app_linked_at,history_sync_progress,history_sync_declined from whatsapp_accounts where tenant_id=$1',[tenant])).rows[0];
 assert.ok(row.app_linked_at);assert.equal(row.history_sync_progress,40);assert.equal(row.history_sync_declined,true);
 await save(owner,tenant,'1111122222');
 row=(await db.query('select app_linked_at,contacts_sync_requested_at,history_sync_requested_at,history_sync_progress,history_sync_declined from whatsapp_accounts where tenant_id=$1',[tenant])).rows[0];
 assert.deepEqual(row,{app_linked_at:null,contacts_sync_requested_at:null,history_sync_requested_at:null,history_sync_progress:null,history_sync_declined:false});
 await denied(()=>db.query('update whatsapp_accounts set history_sync_progress=101 where tenant_id=$1',[tenant]),/check constraint/);
 await asUser(viewer);
 assert.equal((await db.query('select app_linked_at,history_sync_progress,history_sync_declined from whatsapp_accounts')).rows.length,1);
 await denied(()=>db.exec('update whatsapp_accounts set history_sync_progress=100'),/permission denied/);
});
test('imported chats are stored once, only in a conversation of the same business, and media placeholders get completed',async()=>{
 const customer=crypto.randomUUID(),foreignCustomer=crypto.randomUUID(),conversation=crypto.randomUUID(),foreign=crypto.randomUUID();
 await db.query("insert into customers(id,tenant_id,phone) values($1,$2,'+573001112233'),($3,$4,'+573009998877')",[customer,tenant,foreignCustomer,other]);
 await db.query('insert into conversations(id,tenant_id,customer_id) values($1,$2,$3),($4,$5,$6)',[conversation,tenant,customer,foreign,other,foreignCustomer]);
 const row=(id,extra={})=>({conversation_id:conversation,direction:'inbound',sender:'customer',type:'text',body:'Hola',media_url:null,wa_message_id:id,raw:{type:'text'},created_at:'2026-09-21T12:00:00Z',...extra});
 const rows=[row('wamid.a'),row('wamid.b',{direction:'outbound',sender:'human',body:'¿Qué talla?'}),row('wamid.c',{type:'other',body:null,raw:{type:'media_placeholder'}}),row('wamid.x',{conversation_id:foreign})];
 const run=list=>db.query('select nexo_import_whatsapp_history($1,$2) n',[tenant,JSON.stringify(list)]);
 await db.exec('set local role authenticated');await denied(()=>run(rows),/permission denied/);await db.exec('reset role');
 await db.exec('set local role service_role');
 assert.equal((await run(rows)).rows[0].n,3,'the row for another business conversation is ignored');
 assert.equal((await run(rows)).rows[0].n,0,'a repeated chunk adds nothing');
 const saved=(await db.query('select wa_message_id,direction,sender,created_at,tenant_id from messages where conversation_id=$1 order by created_at,wa_message_id',[conversation])).rows;
 assert.deepEqual(saved.map(m=>[m.wa_message_id,m.direction,m.sender]),[['wamid.a','inbound','customer'],['wamid.b','outbound','human'],['wamid.c','inbound','customer']]);
 assert.equal(saved[0].created_at.toISOString(),'2026-09-21T12:00:00.000Z');assert.ok(saved.every(m=>m.tenant_id===tenant));
 assert.equal((await db.query('select count(*)::int n from messages where conversation_id=$1',[foreign])).rows[0].n,0);
 assert.equal((await run([row('wamid.c',{type:'image',media_url:'wa-media://42',raw:{type:'image'}})])).rows[0].n,1);
 const media=(await db.query("select type,media_url,raw->>'type' kind from messages where wa_message_id='wamid.c'")).rows[0];
 assert.deepEqual(media,{type:'image',media_url:'wa-media://42',kind:'image'});
 assert.equal((await run([row('wamid.a',{body:'cambiado'})])).rows[0].n,0,'a message that is not a placeholder is never rewritten');
});
