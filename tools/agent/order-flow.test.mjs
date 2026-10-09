import assert from 'node:assert/strict';
import {test} from 'node:test';
import {load,moduleUrl} from './load.mjs';
const customer=crypto.randomUUID(),id=crypto.randomUUID(),tenant=crypto.randomUUID(),user=crypto.randomUUID();
const proposal={id,session_id:'order-flow',status:'pending',expires_at:new Date(Date.now()+900000).toISOString(),order_id:null,handoff_id:null,snapshot:{customer_id:customer,customer_name:'Ana',currency:'COP',fulfillment:'unassigned',subtotal:24000,total:24000,items:[{variant_id:crypto.randomUUID(),sku:'SKU-1',name:'Producto',qty:2,unit_price:12000}]}};
const rows=[],calls=[],rootCalls=[];
globalThis.__orderFlowDB=()=>({
 from(){let inserted;const q={insert(row){inserted=row;rows.push(row);return q;},select(){return q;},eq(){return q;},order(){return q;},limit(){return q;},abortSignal(){return q;},maybeSingle:async()=>({data:null,error:null}),single:async()=>({data:{id:'saved'},error:null}),then(resolve,reject){return Promise.resolve({data:inserted?null:[],error:null}).then(resolve,reject);}};return q;},
 rpc(name,args){calls.push({name,args});const q=Promise.resolve({data:{ok:true,proposal},error:null});q.abortSignal=()=>q;return q;}
});
globalThis.__orderFlowQuery=async(name,args)=>{calls.push({name,args});return {ok:true,data:name==='search_customers'?{customers:[{id:customer,name:'Ana'}]}:{products:[{variants:[{sku:'SKU-1',stock_qty:10,price:12000}]}]}};};
globalThis.__orderFlowStream=async function*(_account,messages){rootCalls.push(messages);const agents=['clientes','catalogo','pedidos'];const agent=agents[rootCalls.length-1];if(agent)yield {type:'tool_calls',toolCalls:[{id:agent,function:{name:'delegate_to_agent',arguments:JSON.stringify({agent,task:`Prepara para ${customer} dos unidades SKU-1 usando los datos verificados.`})}}]};else yield {type:'delta',content:'Propuesta lista. Revisa la tarjeta y confirma con su botón.'};yield {type:'done',model:'fixture',tokensIn:10,tokensOut:5};};
globalThis.__orderFlowComplete=async(_account,messages,tools)=>{
 const read=messages.some(message=>message.role==='tool');const name=tools?.some(tool=>tool.function.name==='prepare_order_proposal')?'prepare_order_proposal':tools?.[0]?.function.name;
 const args=name==='prepare_order_proposal'?{customer_id:customer,items:[{variant_sku:'SKU-1',qty:2}]}:{query:'Ana'};
 return {content:read?'Evidencia verificada, espera confirmación.':null,toolCalls:read||!name?[]:[{id:name,type:'function',function:{name,arguments:JSON.stringify(args)}}],model:'fixture',tokensIn:10,tokensOut:5,latencyMs:1};
};
const shared=await load('../../lib/order-proposals.ts',{zod:import.meta.resolve('zod')});
const orderActions=await load('../../lib/agent/order-actions.ts',{'@/lib/order-proposals':shared});
const {createAgentExecutor}=await import(await load('../../lib/agent/executor.ts',{
 '@/lib/supabase/admin':moduleUrl('export const createAdminClient=()=>globalThis.__orderFlowDB();'),
 '@/lib/llm':moduleUrl("export const calculateCost=()=>0;export const configuredModel=()=> 'fixture';"),
 '@/lib/llm/metered':moduleUrl('export const meteredChatCompletionStream=(...args)=>globalThis.__orderFlowStream(...args);export const meteredChatCompletion=(...args)=>globalThis.__orderFlowComplete(...args);'),
 './web-tools':moduleUrl("export const webCrmTools=()=>['search_customers','search_catalog','list_orders'].map(name=>({type:'function',function:{name}}));export const executeWebToolCall=(...args)=>globalThis.__orderFlowQuery(...args);"),
 './order-actions':orderActions,'./team':await load('../../lib/agent/team.ts',{zod:import.meta.resolve('zod')}),
 '@/lib/jarvis':await load('../../lib/jarvis.ts'),'@/lib/jarvis-personalization':await load('../../lib/jarvis-personalization.ts'),
 '@/lib/files/tools':moduleUrl("export const FILE_TOOLS=[];export const fileContext=()=>'';export const executeFileTool=()=>{throw new Error('unexpected')};"),
}));
test('Clientes → Catálogo → Pedidos produces a persisted/SSE proposal, never an order confirmation',async()=>{
 const events=[];for await(const e of createAgentExecutor({sessionId:'order-flow',tenantId:tenant,userId:user,role:'owner',userMessage:'Prepara para Ana dos unidades SKU-1'}))events.push(e);
 assert.equal(events.at(-1).status,'completed');assert.deepEqual(calls.map(c=>c.name),['search_customers','search_catalog','nexo_prepare_order']);assert.equal(calls.at(-1).args.p_user,user);assert.equal(calls.at(-1).args.p_tenant,tenant);
 assert.equal(events.at(-1).orderProposals[0].id,id);assert.equal(rows.at(-1).metadata.orderProposals[0].id,id);assert.deepEqual(events.at(-1).handoffs.map(h=>h.agent),['clientes','catalogo','pedidos']);assert.equal(rows.at(-1).tokens_in,100);assert.equal(rows.at(-1).tokens_out,50);
 for(const messages of rootCalls)assert.ok(!messages.some(m=>m.tool_calls?.some(c=>c.function.name==='nexo_decide_order')));
});
