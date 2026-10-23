import assert from "node:assert/strict";
import {beforeEach,test} from "node:test";
import {load,moduleUrl} from "../agent/load.mjs";
const tenant=crypto.randomUUID(),customer=crypto.randomUUID(),conversation=crypto.randomUUID(),owner=crypto.randomUUID();
let calls, runs, fixture;
const {persistWebhookPayload,handleWebhookPayload}=await import(await load('../../lib/whatsapp/webhook-handler.ts',{
 '@/lib/supabase/admin':moduleUrl('export const createAdminClient=()=>globalThis.__waEchoAdmin();'),
 '@/lib/agent/loop':moduleUrl('export const runAgent=async(params)=>globalThis.__waEchoRun(params);'),
 '@/lib/llm':moduleUrl('export const transcribeAudio=async()=>"";'),
 './send':moduleUrl('export const downloadMedia=async()=>{throw new Error("unexpected media download")};'),
 './credentials':moduleUrl('export const loadWhatsAppSendOptions=async()=>null;'),
}));
beforeEach(()=>{calls=[];runs=[];fixture={existing:null,owner,handoff:null};});
globalThis.__waEchoRun=params=>runs.push(params);
globalThis.__waEchoAdmin=()=>({from(table){
 const call={table,operation:'select',filters:[]};calls.push(call);
 const result=()=>{
  if(table==='whatsapp_accounts') return {data:{tenant_id:tenant},error:null};
  if(table==='customers') return {data:{id:customer,name:'Fixture'},error:null};
  if(table==='messages') return {data:call.operation==='select'?fixture.existing:{id:crypto.randomUUID()},error:null};
  if(table==='conversations') return {data:call.operation==='update'?null:{id:conversation},error:null};
  if(table==='tenant_members') return {data:fixture.owner?{user_id:fixture.owner}:null,error:null};
  if(table==='handoffs') return {data:call.operation==='select'?fixture.handoff:null,error:null};
  throw new Error(`Unexpected table ${table}`);
 };
 const q={select(fields){call.fields=fields;return q},eq(...args){call.filters.push(['eq',...args]);return q},in(...args){call.filters.push(['in',...args]);return q},order(){return q},limit(){return q},
  upsert(payload){call.operation='upsert';call.payload=payload;return q},insert(payload){call.operation='insert';call.payload=payload;return q},update(payload){call.operation='update';call.payload=payload;return q},
  single:async()=>result(),maybeSingle:async()=>result(),then(resolve,reject){return Promise.resolve(result()).then(resolve,reject)}};return q;
}});
const echoPayload=(echo={})=>({object:'whatsapp_business_account',entry:[{changes:[{field:'smb_message_echoes',value:{messaging_product:'whatsapp',metadata:{display_phone_number:'573503344515',phone_number_id:'123456789'},
 message_echoes:[{from:'573503344515',to:'573001234567',id:'wamid.echo',timestamp:'1792780000',type:'text',text:{body:'Hola, ya te atiendo yo'},...echo}]}}]}]});
const find=(table,operation)=>calls.filter(call=>call.table===table&&call.operation===operation);
test('a reply sent from the WhatsApp Business app is saved as a human message and pauses Zorax without running the agent',async()=>{
 const result=await persistWebhookPayload(echoPayload());
 assert.deepEqual(result,{jobs:[],failed:0});
 assert.equal(find('customers','upsert')[0].payload.phone,'+573001234567','the customer is the recipient, not the business number');
 const [message]=find('messages','insert');
 assert.equal(message.payload.direction,'outbound');assert.equal(message.payload.sender,'human');assert.equal(message.payload.body,'Hola, ya te atiendo yo');assert.equal(message.payload.wa_message_id,'wamid.echo');
 const pause=calls.findIndex(call=>call.table==='conversations'&&call.operation==='update'&&call.payload.status==='handoff');
 assert.ok(pause>=0&&pause<calls.indexOf(message),'the pause is stored before the message so a retry completes it');
 const [handoff]=find('handoffs','insert');
 assert.equal(handoff.payload.status,'taken');assert.equal(handoff.payload.taken_by,owner);assert.equal(handoff.payload.reason,'otro');assert.equal(handoff.payload.priority,'low');assert.equal(handoff.payload.conversation_id,conversation);
 await handleWebhookPayload(echoPayload({id:'wamid.echo.2'}));
 assert.equal(runs.length,0);
});
test('a customer already waiting for an advisor gets that handoff taken by the owner instead of a second one',async()=>{
 fixture.handoff={id:'handoff-open',status:'open'};
 await persistWebhookPayload(echoPayload());
 assert.equal(find('handoffs','insert').length,0);
 const [taken]=find('handoffs','update');
 assert.deepEqual(taken.payload,{status:'taken',taken_by:owner});
 assert.ok(taken.filters.some(f=>f[1]==='id'&&f[2]==='handoff-open'));assert.ok(taken.filters.some(f=>f[1]==='status'&&f[2]==='open'));
});
test('a chat the team already took stays as it is',async()=>{
 fixture.handoff={id:'handoff-taken',status:'taken'};
 await persistWebhookPayload(echoPayload());
 assert.equal(find('handoffs','insert').length,0);assert.equal(find('handoffs','update').length,0);
 assert.equal(find('messages','insert').length,1);
});
test('without an owner the pause still stops Zorax and stays open for the team',async()=>{
 fixture.owner=null;
 await persistWebhookPayload(echoPayload());
 const [handoff]=find('handoffs','insert');assert.equal(handoff.payload.status,'open');assert.equal(handoff.payload.taken_by,null);
});
test('a repeated echo is skipped without touching the conversation',async()=>{
 fixture.existing={id:'already-saved'};
 const result=await persistWebhookPayload(echoPayload());
 assert.equal(result.failed,0);assert.equal(find('messages','insert').length,0);assert.equal(find('conversations','update').length,0);assert.equal(find('handoffs','insert').length,0);
});
