import assert from "node:assert/strict";
import {beforeEach,test} from "node:test";
import {load,moduleUrl} from "../agent/load.mjs";
const tenant=crypto.randomUUID();
let calls, runs, fixture;
const {persistWebhookPayload}=await import(await load('../../lib/whatsapp/webhook-handler.ts',{
 '@/lib/supabase/admin':moduleUrl('export const createAdminClient=()=>globalThis.__waSyncAdmin();'),
 '@/lib/agent/loop':moduleUrl('export const runAgent=async(params)=>globalThis.__waSyncRun(params);'),
 '@/lib/llm':moduleUrl('export const transcribeAudio=async()=>"";'),
 './send':moduleUrl('export const downloadMedia=async()=>{throw new Error("unexpected media download")};'),
 './credentials':moduleUrl('export const loadWhatsAppSendOptions=async()=>null;'),
}));
const {appSyncStatus}=await import(await load('../../lib/whatsapp/setup.ts',{
 './credentials':moduleUrl('export const encryptionConfigured=()=>true;'),
 './cloud':moduleUrl('export const GRAPH_API_VERSION="v26.0";'),
}));
beforeEach(()=>{calls=[];runs=[];fixture={open:[],customerName:null};});
globalThis.__waSyncRun=params=>runs.push(params);
const customerId=phone=>`customer-${phone}`;
globalThis.__waSyncAdmin=()=>({
 rpc:async(name,args)=>{calls.push({table:'rpc',operation:name,payload:args});return {data:args.p_rows.length,error:null};},
 from(table){
  const call={table,operation:'select',filters:[]};calls.push(call);
  const data=()=>{
   if(table==='whatsapp_accounts') return call.operation==='select'?{tenant_id:tenant}:null;
   if(table==='customers') return Array.isArray(call.payload)?call.payload.map(row=>({id:customerId(row.phone),phone:row.phone})):{id:customerId(call.payload.phone),name:fixture.customerName};
   if(table==='conversations'){
    if(call.operation==='insert') return Array.isArray(call.payload)?call.payload.map(row=>({id:`conversation-${row.customer_id}`,customer_id:row.customer_id})):{id:'conversation-new'};
    return call.operation==='select'?fixture.open:null;
   }
   if(table==='messages') return call.operation==='select'?null:{id:crypto.randomUUID()};
   throw new Error(`Unexpected table ${table}`);
  };
  const one=()=>{const value=data();return {data:Array.isArray(value)?value[0]??null:value,error:null};};
  const q={select(fields){call.fields=fields;return q},eq(...args){call.filters.push(['eq',...args]);return q},in(...args){call.filters.push(['in',...args]);return q},or(...args){call.filters.push(['or',...args]);return q},order(){return q},limit(){return q},
   upsert(payload,options){call.operation='upsert';call.payload=payload;call.options=options;return q},insert(payload){call.operation='insert';call.payload=payload;return q},update(payload){call.operation='update';call.payload=payload;return q},
   single:async()=>one(),maybeSingle:async()=>one(),then(resolve,reject){return Promise.resolve({data:data(),error:null}).then(resolve,reject)}};
  return q;
 },
});
const wrap=(field,value)=>({object:'whatsapp_business_account',entry:[{id:'4294697454112263',changes:[{field,value:{messaging_product:'whatsapp',metadata:{display_phone_number:'573503344515',phone_number_id:'123456789'},...value}}]}]});
const at=seconds=>new Date(seconds*1000).toISOString();
const thread={id:'573001112233',messages:[
 {from:'573001112233',id:'wamid.h1',timestamp:'1790000000',type:'text',text:{body:'Hola, ¿tienen tenis blancos?'},history_context:{status:'READ'}},
 {from:'573503344515',to:'573001112233',id:'wamid.h2',timestamp:'1790000100',type:'text',text:{body:'Sí, ¿qué talla?'},history_context:{status:'READ'}},
 {from:'573001112233',id:'wamid.h3',timestamp:'1790000200',type:'media_placeholder',history_context:{status:'DELIVERED'}},
]};
const find=(table,operation)=>calls.filter(call=>call.table===table&&call.operation===operation);
test('a history chunk lands in a conversation with the original dates, both sides of the chat, and never runs Zorax',async()=>{
 const result=await persistWebhookPayload(wrap('history',{history:[{metadata:{phase:0,chunk_order:1,progress:40},threads:[thread]}]}));
 assert.deepEqual(result,{jobs:[],failed:0});assert.equal(runs.length,0);
 assert.deepEqual(find('customers','upsert')[0].payload,[{tenant_id:tenant,phone:'+573001112233'}]);
 const [conversation]=find('conversations','insert')[0].payload;
 assert.equal(conversation.status,'open');assert.equal(conversation.created_at,at(1790000000));assert.equal(conversation.last_message_at,at(1790000200));
 const [imported]=find('rpc','nexo_import_whatsapp_history');
 assert.equal(imported.payload.p_tenant,tenant);
 assert.deepEqual(imported.payload.p_rows.map(row=>[row.direction,row.sender,row.type,row.wa_message_id]),[['inbound','customer','text','wamid.h1'],['outbound','human','text','wamid.h2'],['inbound','customer','other','wamid.h3']]);
 assert.deepEqual(imported.payload.p_rows.map(row=>row.created_at),[at(1790000000),at(1790000100),at(1790000200)]);
 assert.ok(imported.payload.p_rows.every(row=>row.conversation_id===`conversation-${customerId('+573001112233')}`));
 const progress=find('whatsapp_accounts','update').find(call=>'history_sync_progress' in call.payload);
 assert.equal(progress.payload.history_sync_progress,40);assert.ok(progress.filters.some(f=>f[0]==='or'&&f[1].includes('history_sync_progress.lt.40')),'progress only moves forward');
 assert.ok(!find('whatsapp_accounts','update').some(call=>'last_webhook_at' in call.payload),'imported chats are not live reception');
 assert.ok(!find('conversations','update').some(call=>call.payload.status),'importing never pauses a chat');
});
test('a chat already open after linking keeps its conversation and only moves its activity forward',async()=>{
 const id=customerId('+573001112233');
 fixture.open=[{id:'open-conversation',customer_id:id,last_message_at:at(1789999000)}];
 await persistWebhookPayload(wrap('history',{history:[{metadata:{progress:100},threads:[thread]}]}));
 assert.equal(find('conversations','insert').length,0);
 const [moved]=find('conversations','update');assert.deepEqual(moved.payload,{last_message_at:at(1790000200)});
 assert.ok(find('rpc','nexo_import_whatsapp_history')[0].payload.p_rows.every(row=>row.conversation_id==='open-conversation'));
 calls=[];fixture.open=[{id:'open-conversation',customer_id:id,last_message_at:'2026-10-23T12:00:00.000+00:00'}];
 await persistWebhookPayload(wrap('history',{history:[{threads:[thread]}]}));
 assert.equal(find('conversations','update').length,0,'newer activity is not moved back');
});
test('a business that declined sharing its chats is recorded and nothing is imported',async()=>{
 await persistWebhookPayload(wrap('history',{history:[{errors:[{code:2593109,title:'History sync is turned off by the business from the WhatsApp Business App'}]}]}));
 assert.deepEqual(find('whatsapp_accounts','update').map(call=>call.payload),[{history_sync_declined:true}]);
 assert.equal(find('customers','upsert').length,0);assert.equal(find('rpc','nexo_import_whatsapp_history').length,0);
});
test('contacts become customers with the name the business saved; a removed contact stays in the CRM',async()=>{
 await persistWebhookPayload(wrap('smb_app_state_sync',{state_sync:[
  {type:'contact',contact:{full_name:'Laura Tenis 38',first_name:'Laura',phone_number:'573001112233'},action:'add',metadata:{timestamp:'1790000000'}},
  {type:'contact',contact:{phone_number:'573004445566'},action:'add',metadata:{timestamp:'1790000000'}},
  {type:'contact',contact:{phone_number:'573007778899'},action:'remove',metadata:{timestamp:'1790000000'}},
 ]}));
 const upserts=find('customers','upsert').map(call=>call.payload);
 assert.deepEqual(upserts,[[{tenant_id:tenant,phone:'+573001112233',name:'Laura Tenis 38'}],[{tenant_id:tenant,phone:'+573004445566'}]],'a contact without a name never clears an existing one');
 assert.ok(find('customers','upsert').every(call=>call.options.onConflict==='tenant_id,phone'));
 assert.equal(runs.length,0);
});
test('the WhatsApp profile name fills an empty customer name but never replaces a saved one',async()=>{
 const inbound=wrap('messages',{contacts:[{wa_id:'573001112233',profile:{name:'Lau'}}],messages:[{from:'573001112233',id:'wamid.in',timestamp:'1790000300',type:'text',text:{body:'Hola'}}]});
 fixture.customerName='Laura Tenis 38';await persistWebhookPayload(inbound);
 assert.equal(find('customers','update').length,0);
 calls=[];fixture.customerName=null;await persistWebhookPayload(inbound);
 assert.deepEqual(find('customers','update')[0].payload,{name:'Lau'});
});
test('the page says whether the app import is pending, running or over, and until when it can be retried',()=>{
 const linked=new Date('2026-10-23T10:00:00Z').getTime(),base={app_linked_at:new Date(linked).toISOString(),contacts_sync_requested_at:null,history_sync_requested_at:null,history_sync_progress:null,history_sync_declined:false};
 assert.equal(appSyncStatus(null).status,'none');assert.equal(appSyncStatus({...base,app_linked_at:null}).status,'none');
 assert.deepEqual(appSyncStatus(base,linked+3600e3),{status:'pending',progress:null,retryUntil:new Date(linked+24*3600e3).toISOString()});
 assert.equal(appSyncStatus(base,linked+25*3600e3).status,'expired');
 const asked={...base,contacts_sync_requested_at:base.app_linked_at,history_sync_requested_at:base.app_linked_at};
 assert.deepEqual(appSyncStatus({...asked,history_sync_progress:40},linked+25*3600e3),{status:'importing',progress:40,retryUntil:null},'an import already asked keeps going after the window');
 assert.equal(appSyncStatus({...asked,history_sync_progress:100}).status,'done');
 assert.equal(appSyncStatus({...asked,history_sync_declined:true}).status,'declined');
});
