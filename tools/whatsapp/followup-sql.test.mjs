import assert from 'node:assert/strict';
import {before,beforeEach,afterEach,after,test} from 'node:test';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {vector} from '@electric-sql/pglite-pgvector';

const tenant=crypto.randomUUID(),other=crypto.randomUUID(),owner=crypto.randomUUID(),member=crypto.randomUUID(),viewer=crypto.randomUUID(),stranger=crypto.randomUUID();
const customer=crypto.randomUUID(),conversation=crypto.randomUUID(),secondConversation=crypto.randomUUID(),agent=crypto.randomUUID();
let db;
before(async()=>{
 db=new PGlite({extensions:{vector}});
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`);
 const dir=new URL('../../supabase/migrations/',import.meta.url);
 for(const file of(await readdir(dir)).filter(f=>f.endsWith('.sql')).sort())await db.exec((await readFile(new URL(file,dir),'utf8')).replace('create extension if not exists pgcrypto;',''));
 await db.query('insert into auth.users values($1),($2),($3),($4)',[owner,member,viewer,stranger]);
 await db.query("insert into tenants(id,name,slug) values($1,'Followups','followup-test'),($2,'Other','followup-other')",[tenant,other]);
 await db.query("insert into tenant_members(tenant_id,user_id,role) values($1,$2,'owner'),($1,$3,'agent'),($1,$4,'viewer'),($5,$6,'owner')",[tenant,owner,member,viewer,other,stranger]);
 await db.query("insert into customers(id,tenant_id,phone) values($1,$2,'+573001111111')",[customer,tenant]);
 await db.query('insert into conversations(id,tenant_id,customer_id) values($1,$2,$3),($4,$2,$3)',[conversation,tenant,customer,secondConversation]);
 await db.query("insert into agents(id,tenant_id,name,system_prompt,mode,business_rules) values($1,$2,'Seller','Sell','autonomous',$3::jsonb)",[agent,tenant,JSON.stringify({sales_payments:{version:'v1',link_url:'https://pay.example/business',transfer_instructions:'Banco ficticio'}})]);
 // Supabase supplies these pre-existing CRM service grants outside migrations.
 await db.exec('grant all on all tables in schema public to service_role;grant usage,select on all sequences in schema public to service_role;');
});
beforeEach(async()=>db.exec('begin'));
afterEach(async()=>db.exec('rollback;reset role'));
after(async()=>db?.close());
const result=async(sql,args=[])=>(await db.query(sql,args)).rows[0].r;
const configure=(enabled=true,max=1,user=owner,delay=30,tid=tenant)=>result('select nexo_configure_sales_followups($1,$2,$3,$4,$5) r',[tid,user,enabled,delay,max]);
const enqueue=()=>result('select nexo_enqueue_sales_followups() r');
const claim=(limit=3)=>result('select nexo_claim_sales_followups($1) r',[limit]);
const begin=(j,token=j.lease_token)=>result('select nexo_begin_sales_followup($1,$2) r',[j.id,token]);
const finish=(j,status='sent',reason=null,wa='wamid.test.'+crypto.randomUUID(),body='Tu pedido sigue pendiente de pago.')=>result('select nexo_finish_sales_followup($1,$2,$3,$4,$5,$6) r',[j.id,j.lease_token,status,reason,wa,body]);
const cancel=(id,user=owner,tid=tenant)=>result('select nexo_cancel_sales_followup($1,$2,$3) r',[tid,user,id]);
const row=id=>result('select to_jsonb(j) r from nexo_sales_followups j where id=$1',[id]);
const denied=async(fn,pattern)=>{await db.exec('savepoint denied');await assert.rejects(fn,pattern);await db.exec('rollback to savepoint denied');};
async function inbound(text,conv=conversation,extra={}){
 const id=crypto.randomUUID();await db.query("insert into messages(id,tenant_id,conversation_id,direction,sender,type,body,transcript,created_at) values($1,$2,$3,'inbound','customer',$4::message_type,$5,$6,clock_timestamp())",[id,tenant,conv,extra.type??'text',text,extra.transcript??null]);return id;
}
async function accepted({enabled=true,max=1,legacy=false,receipt=true,basisHours=1,payment='enlace',status='pending_payment',paid='pending',raw=true}={}){
 if(enabled){await configure(true,max);await db.query("update nexo_sales_followup_settings set enabled_at=clock_timestamp()-interval '2 hours' where tenant_id=$1",[tenant]);}
 const order=crypto.randomUUID(),basis=crypto.randomUUID();
 await db.query('insert into orders(id,tenant_id,customer_id,conversation_id,status,payment_status,payment_method,total) values($1,$2,$3,$4,$5::order_status,$6::payment_status,$7::payment_method,208000)',[order,tenant,customer,conversation,status,paid,payment]);
 await db.query("insert into messages(id,tenant_id,conversation_id,direction,sender,body,raw,created_at) values($1,$2,$3,'inbound','customer','Sí, confirmo',$4::jsonb,clock_timestamp()-$5*interval '1 hour')",[basis,tenant,conversation,JSON.stringify(raw?{nexo_confirmed_order:order,nexo_accepted_snapshot:{total:208000,payment_instructions:{version:'v1',link_url:'https://pay.example/business',transfer_instructions:'Banco ficticio'}}}:{}),basisHours]);
 if(receipt)await db.query("insert into messages(tenant_id,conversation_id,direction,sender,body,raw,created_at) values($1,$2,'outbound','agent','Pedido confirmado. Pago pendiente.',$3::jsonb,clock_timestamp()-$4*interval '1 hour'+interval '1 second')",[tenant,conversation,JSON.stringify({nexo_sale:'order_confirmed',order_id:order}),basisHours]);
 if(legacy)await db.query('update nexo_sales_followup_settings set enabled_at=clock_timestamp() where tenant_id=$1',[tenant]);
 return {order,basis};
}

test('followups are opt-in and never backfill legacy orders or unverified model confirmations',async()=>{
 await accepted({enabled:false});assert.equal(await enqueue(),0);assert.deepEqual(await claim(),[]);
 await configure(true);assert.equal(await enqueue(),0);assert.deepEqual(await claim(),[]);
 await db.exec('delete from orders;delete from messages;');
 await db.exec('savepoint cases');
 for(const options of [{legacy:true},{receipt:false},{raw:false},{basisHours:24},{basisHours:-1},{paid:'paid'},{status:'draft'},{payment:'otro'}]){
  await accepted(options);await enqueue();assert.equal((await db.query('select count(*)::int n from nexo_sales_followups')).rows[0].n,0);
  await db.exec('rollback to savepoint cases');
 }
});

test('enqueue/claim/begin/finish send once, keep payment pending and persist receipt atomically',async()=>{
 const {order,basis}=await accepted();assert.equal(await enqueue(),1);assert.equal(await enqueue(),0);
 const jobs=await claim();assert.equal(jobs.length,1);const j=jobs[0];assert.equal(j.tenant_id,tenant);assert.deepEqual(await claim(),[]);
 assert.deepEqual(await begin(j,crypto.randomUUID()),{ready:false,reason:'lease_expired'});
 await denied(()=>finish({...j,lease_token:crypto.randomUUID()}),/SALES_FOLLOWUP_NOT_FOUND/);
 assert.equal((await row(j.id)).status,'claimed');
 const sending=await begin(j);assert.equal(sending.ready,true);assert.equal(sending.phone,'573001111111');assert.equal(sending.order_id,order);assert.equal(sending.total,208000);
 assert.equal(sending.payment_instructions.version,'v1');assert.deepEqual(await begin(j),{ready:false,reason:'lease_expired'});
 const wa='wamid.followup.real-fixture';await finish(j,'sent',null,wa);await finish(j,'sent',null,wa);
 const messages=(await db.query("select body,raw,wa_message_id from messages where raw->>'followup_id'=$1",[j.id])).rows;
 assert.equal(messages.length,1);assert.equal(messages[0].wa_message_id,wa);assert.equal(messages[0].raw.nexo_sale,'payment_followup');assert.equal(messages[0].raw.order_id,order);
 const state=(await db.query('select status,payment_status from orders where id=$1',[order])).rows[0];assert.deepEqual(state,{status:'pending_payment',payment_status:'pending'});
 assert.equal((await row(j.id)).basis_message_id,basis);assert.equal((await row(j.id)).status,'sent');
 assert.deepEqual(await claim(),[]);
});

test('finish validates payload and failed receipt insertion leaves sending state intact',async()=>{
 await accepted();const[j]=await claim();await begin(j);
 for(const args of [['sent',null,'', 'Body'],['sent',null,'wamid.test',''],['sent','invented_reason','wamid.test','Body'],['paid',null,'wamid.test','Body']])await denied(()=>finish(j,...args),/SALES_FOLLOWUP_INVALID/);
 await db.query("insert into messages(tenant_id,conversation_id,direction,sender,body,wa_message_id) values($1,$2,'outbound','agent','Existing fixture','wamid.collision')",[tenant,conversation]);
 await denied(()=>finish(j,'sent',null,'wamid.collision','Body'),/duplicate key/);
 assert.equal((await row(j.id)).status,'sending');assert.equal((await db.query("select count(*)::int n from messages where raw->>'followup_id'=$1",[j.id])).rows[0].n,0);
 await finish(j,'unknown','delivery_uncertain',null,null);assert.equal((await row(j.id)).status,'unknown');assert.deepEqual(await claim(),[]);
 await db.exec('savepoint reason_paths');
 for(const[status,reason]of[['blocked','invalid_snapshot'],['blocked','message_too_long'],['blocked','channel_not_configured'],['unknown','provider_response_invalid']]){
  await accepted();const[next]=await claim();await begin(next);await finish(next,status,reason,null,null);
  assert.equal((await row(next.id)).status,status);assert.equal((await row(next.id)).reason,reason);
  assert.equal((await db.query("select count(*)::int n from messages where raw->>'followup_id'=$1",[next.id])).rows[0].n,0);
  await db.exec('rollback to savepoint reason_paths');
 }
});

test('eligibility is rechecked before dispatch for pause, disabled autonomy, handoff, paid order and changed payment terms',async()=>{
 await db.exec('savepoint scenario');
 const scenarios=[
  ["update nexo_sales_followup_settings set enabled=false",'followups_paused'],
  ["update agents set mode='shadow'",'autonomy_disabled'],
  ["update agents set active=false",'autonomy_disabled'],
  ["update tenants set status='paused' where id='"+tenant+"'",'autonomy_disabled'],
  ["update conversations set status='handoff'",'conversation_unavailable'],
  ["update conversations set assigned_to='"+owner+"'",'conversation_unavailable'],
  ["insert into handoffs(tenant_id,conversation_id,reason,summary,status) values('"+tenant+"','"+conversation+"','solicitud_cliente','Fixture','open')",'conversation_unavailable'],
  ["insert into messages(tenant_id,conversation_id,direction,sender,body,created_at) values('"+tenant+"','"+conversation+"','outbound','human','Te atiendo personalmente',clock_timestamp())",'conversation_unavailable'],
  ["update orders set payment_status='paid'",'order_no_longer_pending'],
  ["update orders set total=1",'payment_terms_changed'],
  ["update agents set business_rules=jsonb_set(business_rules,'{sales_payments,version}','\"v2\"')",'payment_terms_changed'],
  ["update messages set created_at=clock_timestamp()-interval '24 hours' where direction='inbound'",'service_window_closed'],
 ];
 for(const[mutation,reason]of scenarios){
  await accepted();const[j]=await claim();assert.ok(j);await db.exec(mutation);
  assert.deepEqual(await begin(j),{ready:false,reason});assert.equal((await row(j.id)).status,'canceled');assert.deepEqual(await claim(),[]);
  await db.exec('rollback to savepoint scenario');
 }
});

test('editing an older autonomous agent cannot enable followups when the newest active agent is copilot',async()=>{
 await db.query("update agents set created_at=clock_timestamp()-interval '2 days',updated_at=clock_timestamp(),mode='autonomous' where id=$1",[agent]);
 await db.query("insert into agents(tenant_id,name,system_prompt,mode,business_rules,created_at,updated_at) values($1,'Current copilot','Review before sending','copilot',$2::jsonb,clock_timestamp()-interval '1 day',clock_timestamp()-interval '1 day')",
  [tenant,JSON.stringify({sales_payments:{version:'v1',link_url:'https://pay.example/business',transfer_instructions:'Banco ficticio'}})]);
 const {order}=await accepted();await enqueue();
 const job=(await db.query('select id,status,reason from nexo_sales_followups where order_id=$1',[order])).rows[0];
 assert.equal(job.status,'canceled');assert.equal(job.reason,'autonomy_disabled');assert.deepEqual(await claim(),[]);
});

test('editing an older copilot agent cannot block the newest autonomous agent or replace its payment terms',async()=>{
 await db.query("update agents set created_at=clock_timestamp()-interval '2 days',updated_at=clock_timestamp(),mode='copilot',business_rules=$2::jsonb where id=$1",
  [agent,JSON.stringify({sales_payments:{version:'old-edited',link_url:'https://pay.example/old-business',transfer_instructions:'Otra cuenta ficticia'}})]);
 await db.query("insert into agents(tenant_id,name,system_prompt,mode,business_rules,created_at,updated_at) values($1,'Current seller','Sell autonomously','autonomous',$2::jsonb,clock_timestamp()-interval '1 day',clock_timestamp()-interval '1 day')",
  [tenant,JSON.stringify({sales_payments:{version:'v1',link_url:'https://pay.example/business',transfer_instructions:'Banco ficticio'}})]);
 await accepted();const jobs=await claim();assert.equal(jobs.length,1);
 const ready=await begin(jobs[0]);assert.equal(ready.ready,true);assert.equal(ready.payment_instructions.version,'v1');assert.equal(ready.payment_instructions.link_url,'https://pay.example/business');
});

test('new replies cancel claimed reminders and audio opt-out remains across conversations',async()=>{
 await db.exec('savepoint scenario');
 await accepted();const[j]=await claim();await inbound('Tengo una duda');assert.equal((await row(j.id)).status,'canceled');assert.equal((await row(j.id)).reason,'customer_replied');assert.equal((await begin(j)).ready,false);
 await db.exec('rollback to savepoint scenario');
 await accepted();const[audioJob]=await claim();
 const audio=await inbound('[Audio]',secondConversation,{type:'audio'});
 await db.query("update messages set transcript='No quiero más recordatorios' where id=$1",[audio]);
 const stopped=(await db.query('select * from nexo_sales_contact_preferences where tenant_id=$1 and customer_id=$2',[tenant,customer])).rows[0];
 assert.equal(stopped.source_message_id,audio);assert.deepEqual(await claim(),[]);assert.equal((await row(audioJob.id)).reason,'customer_opted_out');
 await db.exec('rollback to savepoint scenario');
 const {order}=await accepted();await enqueue();const fresh=(await db.query('select id from nexo_sales_followups where order_id=$1',[order])).rows[0];
 await inbound('No me escribas',secondConversation);assert.equal((await row(fresh.id)).status,'canceled');assert.equal((await row(fresh.id)).reason,'customer_opted_out');
 await db.exec('rollback to savepoint scenario');
 await accepted();const[uppercaseJob]=await claim();const uppercase=await inbound('NO QUIERO MÁS RECORDATORIOS',secondConversation);
 assert.equal((await row(uppercaseJob.id)).reason,'customer_opted_out');
 assert.equal((await db.query('select source_message_id from nexo_sales_contact_preferences where customer_id=$1',[customer])).rows[0].source_message_id,uppercase);
});

test('expired claimed leases retry with a new token but expired sending becomes unknown and never retries',async()=>{
 await accepted();const[first]=await claim();await db.query("update nexo_sales_followups set lease_until=clock_timestamp()-interval '1 second' where id=$1",[first.id]);
 const[retry]=await claim();assert.equal(retry.id,first.id);assert.notEqual(retry.lease_token,first.lease_token);assert.equal((await begin(first)).ready,false);
 assert.equal((await begin(retry)).ready,true);await db.query("update nexo_sales_followups set lease_until=clock_timestamp()-interval '1 second' where id=$1",[retry.id]);
 assert.deepEqual(await claim(),[]);const uncertain=await row(retry.id);assert.equal(uncertain.status,'unknown');assert.equal(uncertain.reason,'delivery_uncertain');
 await denied(()=>finish(retry),/SALES_FOLLOWUP_INVALID/);assert.deepEqual(await claim(),[]);
});

test('second reminder waits from successful first send, stays queued until due, and never duplicates',async()=>{
 await accepted({max:2});const[first]=await claim();assert.equal((await row(first.id)).reminder_no,1);await begin(first);await finish(first);
 assert.equal(await enqueue(),1);const second=(await db.query('select id,due_at,status from nexo_sales_followups where reminder_no=2')).rows[0];
 assert.equal(second.status,'queued');assert.deepEqual(await claim(),[]);assert.equal((await row(second.id)).status,'queued');assert.equal(await enqueue(),0);
 await db.query("update nexo_sales_followups set updated_at=clock_timestamp()-interval '31 minutes' where id=$1",[first.id]);
 await db.query("update nexo_sales_followups set due_at=clock_timestamp()-interval '1 minute' where id=$1",[second.id]);
 const[next]=await claim();assert.equal(next.id,second.id);await begin(next);await finish(next);
 assert.equal(await enqueue(),0);assert.deepEqual(await claim(),[]);assert.equal((await db.query('select count(*)::int n from nexo_sales_followups')).rows[0].n,2);
});

test('owner configures, agent cancels, viewers/foreign tenants are denied, and pause cancels unsent work',async()=>{
 for(const user of [member,viewer,stranger])await denied(()=>configure(true,1,user),/SALES_OWNER_REQUIRED/);
 for(const[delay,max]of[[29,1],[721,1],[30,0],[30,3]])await denied(()=>configure(true,max,owner,delay),/SALES_FOLLOWUP_INVALID/);
 await accepted();const[j]=await claim();
 await denied(()=>cancel(j.id,viewer),/SALES_MEMBER_REQUIRED/);await denied(()=>cancel(j.id,stranger),/SALES_MEMBER_REQUIRED/);
 await denied(()=>cancel(j.id,stranger,other),/SALES_FOLLOWUP_NOT_FOUND/);
 assert.equal((await cancel(j.id,member)).status,'canceled');assert.equal((await row(j.id)).reason,'canceled_by_user');
 await db.query("update nexo_sales_followups set status='queued' where id=$1",[j.id]);await configure(false);assert.equal((await row(j.id)).reason,'followups_paused');
});

test('all followup RPCs are service-only/invoker and RLS only exposes this tenant to members',async()=>{
 await accepted();await enqueue();
 const signatures=['nexo_configure_sales_followups(uuid,uuid,boolean,integer,integer)','nexo_cancel_sales_followup(uuid,uuid,uuid)','nexo_sales_incoming_guard()',
 'nexo_sales_followup_block_reason(uuid)','nexo_enqueue_sales_followups()','nexo_claim_sales_followups(integer)','nexo_begin_sales_followup(uuid,uuid)',
 'nexo_finish_sales_followup(uuid,uuid,text,text,text,text)','nexo_consume_sales_worker_ticket(uuid)','nexo_dispatch_sales_followup_worker()'];
 for(const signature of signatures){
  for(const role of ['anon','authenticated'])assert.equal((await db.query("select has_function_privilege($1,$2,'EXECUTE') allowed",[role,signature])).rows[0].allowed,false);
  assert.equal((await db.query("select has_function_privilege('service_role',$1,'EXECUTE') allowed",[signature])).rows[0].allowed,true);
  const proc=(await db.query('select prosecdef,proconfig from pg_proc where oid=$1::regprocedure',[signature])).rows[0];assert.equal(proc.prosecdef,false);assert.ok(proc.proconfig.includes('search_path=""'));
 }
 for(const table of ['nexo_sales_followup_settings','nexo_sales_followups','nexo_sales_contact_preferences','nexo_sales_worker_tickets']){
  for(const privilege of ['INSERT','UPDATE','DELETE'])assert.equal((await db.query("select has_table_privilege('authenticated',$1,$2) allowed",[table,privilege])).rows[0].allowed,false);
 }
 assert.equal((await db.query("select has_table_privilege('authenticated','nexo_sales_worker_tickets','SELECT') allowed")).rows[0].allowed,false);
 for(const[user,count]of[[stranger,0],[owner,1],[member,1],[viewer,1]]){
  await db.query("select set_config('request.jwt.claim.sub',$1,true)",[user]);await db.exec('set local role authenticated');
  assert.equal((await db.query('select count(*)::int n from nexo_sales_followups')).rows[0].n,count);
  assert.equal((await db.query('select count(*)::int n from nexo_sales_followup_settings')).rows[0].n,count);await db.exec('reset role');
 }
 await db.exec('set local role service_role');const[j]=await claim();assert.equal((await begin(j)).ready,true);assert.equal((await finish(j)).status,'sent');
});

test('worker tickets are short-lived, hashed, one-use and cannot be consumed with the wrong token',async()=>{
 const good=crypto.randomUUID(),expired=crypto.randomUUID();
 await db.query("insert into nexo_sales_worker_tickets(token_hash,expires_at) values(encode(sha256(convert_to($1,'UTF8')),'hex'),clock_timestamp()+interval '2 minutes'),(encode(sha256(convert_to($2,'UTF8')),'hex'),clock_timestamp()-interval '1 second')",[good,expired]);
 const consume=token=>result('select nexo_consume_sales_worker_ticket($1) r',[token]);
 assert.equal(await consume(crypto.randomUUID()),false);assert.equal(await consume(expired),false);assert.equal(await consume(good),true);assert.equal(await consume(good),false);
 const stored=(await db.query('select token_hash,consumed_at from nexo_sales_worker_tickets')).rows;assert.equal(stored.some(r=>r.token_hash===good),false);assert.equal(stored.filter(r=>r.consumed_at).length,1);
});
