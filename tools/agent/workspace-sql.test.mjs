import assert from 'node:assert/strict';
import { before, beforeEach, afterEach, after, test } from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';
const tenant=crypto.randomUUID(), other=crypto.randomUUID(), owner=crypto.randomUUID(), outsider=crypto.randomUUID(), viewer=crypto.randomUUID(), agent=crypto.randomUUID(), customer=crypto.randomUUID(), foreignCustomer=crypto.randomUUID();
let db;
before(async()=>{
  db=new PGlite({extensions:{vector}});
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
    create schema auth;create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`);
  const dir=new URL('../../supabase/migrations/',import.meta.url);
  for(const f of (await readdir(dir)).filter(f=>f.endsWith('.sql')).sort())await db.exec((await readFile(new URL(f,dir),'utf8')).replace('create extension if not exists pgcrypto;',''));
  await db.exec('grant select on tenant_members to authenticated');
  for(const id of [owner,outsider,viewer,agent])await db.query('insert into auth.users values($1)',[id]);
  await db.query("insert into tenants(id,name,slug) values($1,'A','work-a'),($2,'B','work-b')",[tenant,other]);
  for(const [t,u,r] of [[tenant,owner,'owner'],[tenant,viewer,'viewer'],[tenant,agent,'agent'],[other,outsider,'owner']])await db.query('insert into tenant_members(tenant_id,user_id,role) values($1,$2,$3)',[t,u,r]);
  await db.query("insert into customers(id,tenant_id,phone,name) values($1,$2,'A','Ana'),($3,$4,'B','Otro')",[customer,tenant,foreignCustomer,other]);
  await db.query("insert into jarvis_sessions(session_id,user_id,tenant_id) values('work-session',$1,$2)",[owner,tenant]);
});
beforeEach(async()=>db.exec('begin'));
afterEach(async()=>db.exec('rollback;reset role'));
after(async()=>db?.close());
const future=()=>new Date(Date.now()+86400000).toISOString();
const propose=async(input={kind:'memory',title:'Preferencia',body:'Entrega por la mañana',customer_id:customer},user=owner,key=crypto.randomUUID(),session=null)=>(await db.query('select nexo_propose_work($1,$2,$3,$4,$5::jsonb) as r',[tenant,user,session,key,JSON.stringify(input)])).rows[0].r;
const change=async(w,action='confirm',uid=owner,patch={})=>(await db.query('select nexo_change_work($1,$2,$3,$4,$5,$6::jsonb) as r',[tenant,uid,w.id,w.revision,action,JSON.stringify(patch)])).rows[0].r;
const worker=async()=>(await db.query('select nexo_enqueue_task_reminders() as n')).rows[0].n;
async function denied(operation,pattern){await db.exec('savepoint denied');await assert.rejects(operation,pattern);await db.exec('rollback to savepoint denied');}
async function asUser(uid){await db.query("select set_config('request.jwt.claim.sub',$1,true)",[uid]);await db.exec('set local role authenticated');}

test('proposals remain inactive until human confirmation, are idempotent and preserve source/actor',async()=>{
  const key=crypto.randomUUID(),input={kind:'memory',title:'Preferencia',body:'Por la mañana',customer_id:customer};
  const a=await propose(input,owner,key,'work-session'),b=await propose(input,owner,key,'work-session');
  assert.equal(a.id,b.id);assert.equal(a.status,'proposed');assert.equal(a.source_session,'work-session');
  const active=await change(a);assert.equal(active.status,'active');assert.equal(active.confirmed_by,owner);assert.equal(active.revision,2);
  assert.equal((await change(a)).id,a.id);assert.equal((await db.query('select count(*)::int as n from nexo_work_events')).rows[0].n,2);
});
test('foreign customer, actor, assignee, session and viewer cannot create work',async()=>{
  await denied(()=>propose({kind:'memory',title:'X',customer_id:foreignCustomer}),/NEXO_CUSTOMER/);
  for(const user of [viewer,outsider])await denied(()=>propose(undefined,user),/NEXO_FORBIDDEN/);
  await denied(()=>propose({kind:'task',title:'X',due_at:future(),assignee_id:outsider}),/NEXO_ASSIGNEE/);
  await denied(()=>propose(undefined,agent,crypto.randomUUID(),'work-session'),/NEXO_FORBIDDEN/);
});
test('tasks require finite future dates and valid zones, memories cannot carry due dates',async()=>{
  for(const input of [{kind:'task',title:'X'},{kind:'task',title:'X',due_at:'2000-01-01T00:00Z'}, {kind:'task',title:'X',due_at:'infinity'}, {kind:'task',title:'X',due_at:future(),timezone:'Bogota'}, {kind:'memory',title:'X',due_at:future()}])await denied(()=>propose(input));
});
test('expired proposals and revoked memberships cannot activate anything',async()=>{
  const p=await propose();await db.query("update nexo_work_items set expires_at=now()-interval '1 minute' where id=$1",[p.id]);await denied(()=>change(p),/NEXO_EXPIRED/);
  await db.exec("update tenant_members set role='viewer' where role='owner'");await denied(()=>change(p),/NEXO_FORBIDDEN/);
});
test('editing requires current revision; deleting removes content and keeps only minimal audit',async()=>{
  const a=await change(await propose()),b=await change(a,'edit',agent,{title:'Corregido',body:'Nueva preferencia'});
  assert.equal(b.body,'Nueva preferencia');assert.equal(b.revision,3);await denied(()=>change(a,'edit',owner,{title:'Viejo',body:'No'}),/NEXO_CONFLICT/);
  assert.equal((await change(b,'delete')).deleted,true);assert.equal((await db.query('select * from nexo_work_items')).rows.length,0);
  const audit=(await db.query('select * from nexo_work_events order by id desc limit 1')).rows[0];assert.equal(audit.action,'deleted');assert.equal('body' in audit,false);
});
test('worker persists one internal reminder per task/due/recipient without a browser',async()=>{
  const w=await change(await propose({kind:'task',title:'Seguimiento',due_at:future(),timezone:'America/Bogota'}));
  assert.equal(await worker(),0);await db.query("update nexo_work_items set due_at=now()-interval '1 minute' where id=$1",[w.id]);
  assert.equal(await worker(),1);assert.equal(await worker(),0);
  const reminder=(await db.query('select * from nexo_task_reminders')).rows[0];assert.equal(reminder.user_id,owner);assert.equal(reminder.item_id,w.id);
});
test('unconfirmed, completed and canceled tasks never notify; rescheduling uses a new due slot',async()=>{
  const p=await propose({kind:'task',title:'Pendiente',due_at:future()});
  await db.query("update nexo_work_items set due_at=now()-interval '1 minute' where id=$1",[p.id]);assert.equal(await worker(),0);
  const a=await change(await propose({kind:'task',title:'Activa',due_at:future()}));
  await db.query("update nexo_work_items set due_at=now()-interval '1 minute' where id=$1",[a.id]);assert.equal(await worker(),1);
  const updated=await change(a,'edit',owner,{title:'Nueva fecha',body:'',due_at:future(),timezone:'UTC'});assert.equal(await worker(),0);
  await db.query("update nexo_work_items set due_at=now()-interval '2 minutes' where id=$1",[a.id]);assert.equal(await worker(),1);
  await change(updated,'complete');assert.equal(await worker(),0);
  const c=await change(await propose({kind:'task',title:'Cancelar',due_at:future()}));await change(c,'cancel');await db.query("update nexo_work_items set due_at=now()-interval '1 minute' where id=$1",[c.id]);assert.equal(await worker(),0);
});
test('revoked assignee cannot receive reminder and confirmation revalidates assignment',async()=>{
  const p=await propose({kind:'task',title:'Asignada',due_at:future(),assignee_id:agent});
  await db.query('delete from tenant_members where tenant_id=$1 and user_id=$2',[tenant,agent]);await denied(()=>change(p),/NEXO_ASSIGNEE/);
});
test('RLS isolates businesses, hides other peoples proposals and restricts reminder recipient',async()=>{
  const p=await propose(),a=await change(await propose({kind:'task',title:'Tarea',due_at:future()}));
  await db.query("update nexo_work_items set due_at=now()-interval '1 minute' where id=$1",[a.id]);await worker();
  await asUser(outsider);assert.equal((await db.query('select * from nexo_work_items')).rows.length,0);assert.equal((await db.query('select * from nexo_task_reminders')).rows.length,0);
  await asUser(viewer);assert.deepEqual((await db.query('select id from nexo_work_items')).rows.map(r=>r.id),[a.id]);assert.equal((await db.query('select * from nexo_task_reminders')).rows.length,0);
  await asUser(owner);assert.equal((await db.query('select id from nexo_work_items')).rows.length,2);assert.equal((await db.query('select * from nexo_task_reminders')).rows.length,1);
  for(const role of ['anon','authenticated']){await db.exec(`reset role;set local role ${role}`);await denied(()=>change(p),/permission denied/);await denied(()=>propose(),/permission denied/);await denied(()=>worker(),/permission denied/);await denied(()=>db.exec("update nexo_work_items set status='active'"),/permission denied/);}
});
test('failed audit writes roll back the confirmed record and its state change',async()=>{
  const p=await propose();await db.exec("create function fail_work_audit() returns trigger language plpgsql as $$begin raise exception 'audit fixture';end$$;create trigger fail_audit before insert on nexo_work_events for each row execute function fail_work_audit();");
  await denied(()=>change(p),/audit fixture/);assert.equal((await db.query('select status from nexo_work_items')).rows[0].status,'proposed');
});
