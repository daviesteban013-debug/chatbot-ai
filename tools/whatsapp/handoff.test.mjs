import assert from "node:assert/strict";
import {beforeEach,test} from "node:test";
import {load,moduleUrl} from "../agent/load.mjs";
const tenant=crypto.randomUUID(),customer=crypto.randomUUID(),conversation=crypto.randomUUID();
let calls, runs;
const {handleWebhookPayload}=await import(await load('../../lib/whatsapp/webhook-handler.ts',{
 '@/lib/supabase/admin':moduleUrl('export const createAdminClient=()=>globalThis.__waWebhookAdmin();'),
 '@/lib/agent/loop':moduleUrl('export const runAgent=async(params)=>globalThis.__waRun(params);'),
 '@/lib/llm':moduleUrl('export const transcribeAudio=async()=>"";'),
 './send':moduleUrl('export const downloadMedia=async()=>{throw new Error("unexpected media download")};'),
 './credentials':moduleUrl('export const loadWhatsAppSendOptions=async()=>null;'),
}));
beforeEach(()=>{calls=[];runs=[];});
globalThis.__waRun=params=>runs.push(params);
globalThis.__waWebhookAdmin=()=>({from(table){
 const call={table,operation:'select',filters:[]};calls.push(call);
 const result=()=>{
  if(table==='whatsapp_accounts') return {data:{tenant_id:tenant},error:null};
  if(table==='customers') return {data:{id:customer,name:'Fixture'},error:null};
  if(table==='messages') return {data:call.operation==='insert'?{id:crypto.randomUUID()}:null,error:null};
  if(table==='conversations') return {data:call.fields==='status'?{status:'handoff'}:{id:conversation},error:null};
  throw new Error(`Unexpected table ${table}`);
 };
 const q={select(fields){call.fields=fields;return q},eq(...args){call.filters.push(['eq',...args]);return q},in(...args){call.filters.push(['in',...args]);return q},order(...args){call.filters.push(['order',...args]);return q},limit(){return q},upsert(){call.operation='upsert';return q},insert(){call.operation='insert';return q},update(){call.operation='update';return q},single:async()=>result(),maybeSingle:async()=>result(),then(resolve,reject){return Promise.resolve(result()).then(resolve,reject)}};return q;
}});
test('a new inbound message reuses the handoff conversation and preserves history without invoking the agent',async()=>{
 await handleWebhookPayload({object:'whatsapp_business_account',entry:[{changes:[{field:'messages',value:{metadata:{phone_number_id:'123456789'},messages:[{id:'wamid.fixture',from:'573000000000',type:'text',text:{body:'Sigo esperando al asesor'}}]}}]}]});
 const lookup=calls.find(call=>call.table==='conversations'&&call.fields==='id');
 assert.ok(lookup);assert.ok(lookup.filters.some(filter=>filter[0]==='in'&&filter[1]==='status'&&filter[2].includes('handoff')));
 assert.ok(lookup.filters.some(filter=>filter[0]==='eq'&&filter[1]==='tenant_id'&&filter[2]===tenant));
 assert.ok(!calls.some(call=>call.table==='conversations'&&call.operation==='insert'));
 assert.equal(runs.length,0);
 assert.ok(calls.some(call=>call.table==='messages'&&call.operation==='insert'));
});
test('messages of one conversation in a batch run the agent once, with the latest message',async()=>{
 const {runWebhookJobs}=await import(await load('../../lib/whatsapp/webhook-handler.ts',{
  '@/lib/supabase/admin':moduleUrl('export const createAdminClient=()=>({from(){const q={select(){return q},eq(){return q},maybeSingle:async()=>({data:{status:"open"},error:null})};return q;}});'),
  '@/lib/agent/loop':moduleUrl('export const runAgent=async(params)=>globalThis.__waRun(params);'),
  '@/lib/llm':moduleUrl('export const transcribeAudio=async()=>"";'),
  './send':moduleUrl('export const downloadMedia=async()=>{throw new Error("unexpected media download")};'),
  './credentials':moduleUrl('export const loadWhatsAppSendOptions=async()=>null;'),
 }));
 const job=(conversationId,messageId)=>({tenantId:tenant,conversationId,customerId:customer,customerPhone:'573000000000',messageId,waMessageId:`wamid.${messageId}`,phoneNumberId:'123456789',audioId:null,accessToken:null});
 await runWebhookJobs([job('a','1'),job('b','2'),job('a','3')]);
 assert.deepEqual(runs.map(run=>[run.conversationId,run.triggerMessageId]).sort(),[['a','3'],['b','2']]);
});
test('a failed message write is reported so Meta retries, while saved messages still get processed',async()=>{
 const {persistWebhookPayload}=await import(await load('../../lib/whatsapp/webhook-handler.ts',{
  '@/lib/supabase/admin':moduleUrl('export const createAdminClient=()=>globalThis.__waFailingAdmin();'),
  '@/lib/agent/loop':moduleUrl('export const runAgent=async()=>{};'),
  '@/lib/llm':moduleUrl('export const transcribeAudio=async()=>"";'),
  './send':moduleUrl('export const downloadMedia=async()=>{throw new Error("unexpected media download")};'),
  './credentials':moduleUrl('export const loadWhatsAppSendOptions=async()=>null;'),
 }));
 globalThis.__waFailingAdmin=()=>({from(table){
  const call={operation:'select'};
  const result=()=>{
   if(table==='whatsapp_accounts') return {data:{tenant_id:tenant},error:null};
   if(table==='customers') return {data:{id:customer,name:'Fixture'},error:null};
   if(table==='conversations') return {data:{id:conversation},error:null};
   if(table==='messages'&&call.operation==='insert') return call.body==='falla'?{data:null,error:{code:'XX000',message:'db down'}}:{data:{id:crypto.randomUUID()},error:null};
   return {data:null,error:null};
  };
  const q={select(){return q},eq(){return q},in(){return q},order(){return q},limit(){return q},upsert(){call.operation='upsert';return q},insert(row){call.operation='insert';call.body=row.body;return q},update(){call.operation='update';return q},single:async()=>result(),maybeSingle:async()=>result(),then(resolve,reject){return Promise.resolve(result()).then(resolve,reject)}};return q;
 }});
 const message=(id,body)=>({id,from:'573000000000',type:'text',text:{body}});
 const result=await persistWebhookPayload({object:'whatsapp_business_account',entry:[{changes:[{field:'messages',value:{metadata:{phone_number_id:'123456789'},messages:[message('wamid.ok','hola'),message('wamid.bad','falla')]}}]}]});
 assert.equal(result.failed,1);
 assert.deepEqual(result.jobs.map(job=>job.waMessageId),['wamid.ok']);
});
