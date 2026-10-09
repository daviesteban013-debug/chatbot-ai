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
