import assert from 'node:assert/strict';
import {beforeEach,test} from 'node:test';
import {load,moduleUrl} from '../agent/load.mjs';
const zod=import.meta.resolve('zod');
const customerMemory=await load('../../lib/agent/customer-memory.ts',{zod});
const tools=await import(await load('../../lib/agent/tools.ts',{
 zod,'./customer-memory':customerMemory,'./sales-policy':await load('../../lib/agent/sales-policy.ts'),
 '@/lib/sales-payments':await load('../../lib/sales-payments.ts',{zod}),
 '@/lib/whatsapp/send':moduleUrl('export const sendImage=async()=>({});'),
 '@/lib/geo/colombia':moduleUrl('export const normalizeCity=(_,v)=>v;export const normalizeDepartment=v=>v;'),
}));
const tenant=crypto.randomUUID(),customer=crypto.randomUUID(),conversation=crypto.randomUUID(),trigger=crypto.randomUUID();
let calls,error;
beforeEach(()=>{calls=[];error=null;});
const db={rpc:async(name,args)=>{calls.push({name,args});return {data:{preferences:[],purchases:[],remembered:true,forgotten:true},error}}};
const context=(extra={})=>({supabase:db,tenantId:tenant,customerId:customer,conversationId:conversation,triggerMessageId:trigger,mode:'autonomous',simulate:false,...extra});
const run=(name,args={},ctx=context())=>tools.executeToolCall(name,args,ctx);
const preference={category:'product_size',value:'M',evidence_quote:'Mi talla es M'};
const forget={category:'product_size',evidence_quote:'Olvida mi talla'};

test('tool schemas never accept scope identifiers or arbitrary categories, and dispatcher uses server scope',async()=>{
 for(const name of ['get_customer_context','remember_customer_preference','forget_customer_preference']){
  const definition=tools.AGENT_TOOLS.find(t=>t.function.name===name).function;
  assert.equal(definition.parameters.additionalProperties,false);
  for(const key of ['tenant_id','customer_id','conversation_id','message_id'])assert.equal(key in definition.parameters.properties,false);
 }
 assert.equal((await run('get_customer_context')).ok,true);
 assert.deepEqual(calls[0],{name:'nexo_get_customer_sales_context',args:{p_tenant:tenant,p_conversation:conversation,p_customer:customer}});
 await run('remember_customer_preference',preference);await run('forget_customer_preference',forget);
 for(const call of calls.slice(1)){
  assert.equal(call.args.p_tenant,tenant);assert.equal(call.args.p_customer,customer);assert.equal(call.args.p_conversation,conversation);assert.equal(call.args.p_trigger,trigger);
 }
 for(const [name,args]of[['get_customer_context',{customer_id:'foreign'}],['remember_customer_preference',{...preference,tenant_id:'foreign'}],
 ['forget_customer_preference',{...forget,customer_id:'foreign'}],['remember_customer_preference',{...preference,category:'private_notes'}]])assert.equal((await run(name,args)).ok,false);
 assert.equal(calls.length,3);
});

test('shadow/simulate/copilot/unknown mode never persist customer preferences or deletions',async()=>{
 for(const extra of [{simulate:true},{mode:'shadow'},{mode:'copilot'},{mode:undefined}]){
  for(const [name,args]of[['remember_customer_preference',preference],['forget_customer_preference',forget]]){
   const r=await run(name,args,context(extra));assert.equal(r.ok,true);assert.deepEqual(r.data,{simulated:true,persisted:false});
  }
 }
 assert.equal(calls.length,0);
});

test('current inbound message evidence is required and RPC validation failures reveal no private SQL details',async()=>{
 for(const [name,args]of[['remember_customer_preference',preference],['forget_customer_preference',forget]]){
  assert.equal((await run(name,args,context({triggerMessageId:undefined}))).ok,false);
 }
 assert.equal(calls.length,0);
 error={message:'SECRET PRIVATE SQL BODY',details:'foreign customer data'};
 for(const [name,args]of[['get_customer_context',{}],['remember_customer_preference',preference],['forget_customer_preference',forget]]){
  const r=await run(name,args);assert.equal(r.ok,false);assert.doesNotMatch(r.error,/SECRET|PRIVATE|foreign customer/);
 }
 assert.equal(calls.at(-1).args.p_quote,forget.evidence_quote);
 const throwing=context({supabase:{rpc:async()=>{throw Error('SECRET RPC EXCEPTION')}}});
 for(const [name,args]of[['get_customer_context',{}],['remember_customer_preference',preference],['forget_customer_preference',forget]]){
  const r=await run(name,args,throwing);assert.equal(r.ok,false);assert.doesNotMatch(r.error,/SECRET|EXCEPTION/);
 }
});

test('memory input bounds reject unbounded/model-generated payloads before any database request',async()=>{
 for(const args of [{...preference,value:'x'.repeat(61)},{...preference,evidence_quote:'x'.repeat(161)},
  {...preference,value:''},{...preference,evidence_quote:''},{...preference,source:'catalog'}])assert.equal((await run('remember_customer_preference',args)).ok,false);
 for(const args of [{...forget,category:'all',evidence_quote:'x'.repeat(161)},{...forget,scope:'all customers'}])assert.equal((await run('forget_customer_preference',args)).ok,false);
 assert.equal(calls.length,0);
});
