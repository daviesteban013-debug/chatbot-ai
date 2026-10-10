import assert from 'node:assert/strict';
import {beforeEach,test} from 'node:test';
import {load,moduleUrl} from '../agent/load.mjs';
let state;
const params={tenantId:crypto.randomUUID(),conversationId:crypto.randomUUID(),customerId:crypto.randomUUID(),triggerMessageId:crypto.randomUUID(),customerPhone:'573001111111',waMessageId:'wamid.inbound'};
beforeEach(()=>{state={mode:'autonomous',calls:[],sends:[],tools:[],queue:[],history:[],credentials:true,sendError:false};});
globalThis.__salesDb=()=>({from(table){const call={table,filters:[]};state.calls.push(call);
 const result=()=>({error:null,data:table==='agents'?{id:'agent',mode:state.mode,system_prompt:'Legacy prompt: escalate doubts to a human',business_rules:{},model:'fixture',auto_confirm_max_total:1,max_discount_pct:0,active:true}:
  table==='messages'&&call.operation==='select'?state.history:call.operation==='insert'?{id:'fixture-run'}:null});
 const q={select(){if(!call.operation)call.operation='select';return q},eq(...args){call.filters.push(args);return q},order(){return q},limit(){return q},
 insert(payload){call.operation='insert';call.payload=payload;return q},update(payload){call.operation='update';call.payload=payload;return q},maybeSingle:async()=>result(),single:async()=>result(),then(resolve){return Promise.resolve(result()).then(resolve)}};return q}});
globalThis.__salesSend=async(to,text)=>{if(state.sendError)throw Error('Fixture delivery failure');state.sends.push({to,text});return {messages:[{id:'wamid.outbound.'+state.sends.length}]}};
globalThis.__salesCompletion=async(messages)=>{state.modelMessages=messages;const value=state.queue.shift();if(value instanceof Error)throw value;return value??reply('Done');};
globalThis.__salesTools=async(name,args,ctx)=>{state.tools.push({name,args,ctx});if(name==='prepare_order_confirmation')ctx.salesReply={text:'Canonical server summary: ¿Confirmas?',raw:{nexo_sale:'order_summary',order_id:'fixture'}};return {ok:true,data:{}}};
globalThis.__salesCredentials=()=>state.credentials?{phoneNumberId:'fixture',accessToken:'synthetic'}:null;
const {runAgent}=await import(await load('../../lib/agent/loop.ts',{
 '@/lib/supabase/admin':moduleUrl('export const createAdminClient=()=>globalThis.__salesDb();'),
 '@/lib/llm':moduleUrl('export const configuredModel=()=>"fixture";export const calculateCost=()=>0;'),
 '@/lib/llm/metered':moduleUrl('export const meteredChatCompletion=(_,messages)=>globalThis.__salesCompletion(messages);'),
 './tools':moduleUrl('export const AGENT_TOOLS=[];export const executeToolCall=(...args)=>globalThis.__salesTools(...args);'),
 './sales-policy':await load('../../lib/agent/sales-policy.ts'),
 '@/lib/whatsapp/credentials':moduleUrl('export const loadWhatsAppSendOptions=async()=>globalThis.__salesCredentials();'),
 '@/lib/whatsapp/send':moduleUrl('export const markAsRead=async()=>{};export const sendText=(...args)=>globalThis.__salesSend(...args);'),
}));
const reply=content=>({content,toolCalls:[],tokensIn:10,tokensOut:5,model:'fixture'});
const tool=(...names)=>({...reply(null),toolCalls:names.map((name,i)=>({id:'t'+i,function:{name,arguments:'{}'}}))});
test('autonomous mode overrides legacy escalation instructions and records sent only after delivery',async()=>{
 state.queue=[reply('Te ayudo por aquí')];await runAgent(params);
 assert.match(state.modelMessages[0].content,/No transfieras una venta/);assert.equal(state.sends.length,1);
 const run=state.calls.find(c=>c.table==='agent_runs'&&c.operation==='insert');assert.equal(run.payload.status,'proposed');assert.equal(run.payload.final_reply,null);
 assert.ok(state.calls.some(c=>c.table==='agent_runs'&&c.operation==='update'&&c.payload.status==='sent'));
});
test('a canonical summary ends the turn before another tool can confirm without a new customer message',async()=>{
 state.queue=[tool('prepare_order_confirmation','confirm_order')];await runAgent(params);
 assert.deepEqual(state.tools.map(t=>t.name),['prepare_order_confirmation']);assert.equal(state.tools[0].ctx.triggerMessageId,params.triggerMessageId);
 assert.equal(state.sends[0].text,'Canonical server summary: ¿Confirmas?');
 const msg=state.calls.find(c=>c.table==='messages'&&c.operation==='insert');assert.equal(msg.payload.raw.nexo_sale,'order_summary');assert.equal(msg.payload.wa_message_id,'wamid.outbound.1');
});
test('exhaustion and model failures stay in the conversation without handing the sale to an advisor',async()=>{
 state.queue=Array.from({length:6},()=>tool('get_sale_state'));await runAgent(params);
 assert.equal(state.tools.length,6);assert.ok(!state.tools.some(t=>t.name==='escalate_to_human'));assert.equal(state.sends.length,1);assert.doesNotMatch(state.sends[0].text,/asesor/);
 state.queue=[new Error('Fixture provider interruption')];state.tools=[];state.sends=[];await runAgent(params);assert.equal(state.tools.length,0);assert.equal(state.sends.length,1);assert.doesNotMatch(state.sends[0].text,/asesor/);
});
test('failed delivery creates no summary proof and does not mark the run sent',async()=>{
 state.queue=[tool('prepare_order_confirmation')];state.sendError=true;await runAgent(params);
 assert.ok(!state.calls.some(c=>c.table==='messages'&&c.operation==='insert'));
 assert.ok(!state.calls.some(c=>c.table==='agent_runs'&&c.operation==='update'&&c.payload.status==='sent'));
 assert.ok(state.calls.some(c=>c.table==='agent_runs'&&c.operation==='update'&&c.payload.status==='error'));
});
test('copilot still keeps response review, and missing credentials never create a sent response',async()=>{
 state.mode='copilot';state.queue=[reply('Propuesta')];await runAgent(params);assert.equal(state.sends.length,0);
 state.mode='autonomous';state.credentials=false;state.queue=[reply('Reply')];await runAgent(params);assert.equal(state.sends.length,0);
 assert.ok(!state.calls.some(c=>c.table==='agent_runs'&&c.operation==='update'&&c.payload.status==='sent'));
});
