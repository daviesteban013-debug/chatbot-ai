import assert from 'node:assert/strict';
import {test} from 'node:test';
import {load,moduleUrl} from './load.mjs';
const tenant=crypto.randomUUID(),user=crypto.randomUUID(),id=crypto.randomUUID();
const calls=[],rows=[];let rootRound=0;
globalThis.__workFlowDb=()=>({from(table){let inserted;const q={select(){return q;},eq(){return q;},order(){return q;},limit(){return q;},abortSignal(){return q;},insert(row){inserted=row;rows.push(row);return q;},maybeSingle:async()=>({data:table==='tenant_members'?{role:'owner'}:null,error:null}),single:async()=>({data:{id:'message'},error:null}),then(resolve){return Promise.resolve({data:inserted?null:[],error:null}).then(resolve);}};return q;},rpc(name,args){calls.push({name,args});return {abortSignal:async()=>({data:{id,status:'proposed',...args.p_input},error:null})};}});
const functionCall=(name,args)=>({id:crypto.randomUUID(),type:'function',function:{name,arguments:JSON.stringify(args)}});
globalThis.__workFlowStream=async function*(){if(++rootRound===1)yield{type:'tool_calls',toolCalls:[functionCall('delegate_to_agent',{agent:'seguimiento',task:'Prepara una tarea para revisar el CRM mañana a las 9 hora de Bogotá, responsable solicitante.'})]};else yield{type:'delta',content:'Propuesta preparada. Abre Memoria y tareas y pulsa Confirmar para activarla.'};yield{type:'done',model:'fixture',tokensIn:10,tokensOut:5};};
globalThis.__workFlowComplete=async(_account,messages)=>({content:'Propuesta pendiente de confirmación.',toolCalls:messages.some(m=>m.role==='tool')?[]:[functionCall('propose_crm_task',{title:'Revisar CRM',due_at:new Date(Date.now()+86400000).toISOString(),timezone:'America/Bogota'})],model:'fixture',tokensIn:10,tokensOut:5,latencyMs:1});
const operator=await load('../../lib/crm-operator.ts');
const {createAgentExecutor}=await import(await load('../../lib/agent/executor.ts',{
 '@/lib/supabase/admin':moduleUrl('export const createAdminClient=()=>globalThis.__workFlowDb();'),
 '@/lib/llm':moduleUrl('export const calculateCost=()=>0;export const configuredModel=()=>"fixture";'),
 '@/lib/llm/metered':moduleUrl('export const meteredChatCompletionStream=(...args)=>globalThis.__workFlowStream(...args);export const meteredChatCompletion=(...args)=>globalThis.__workFlowComplete(...args);'),
 './web-tools':moduleUrl('export const webCrmTools=()=>[];export const executeWebToolCall=()=>{throw new Error("unexpected")};'),
 './team':await load('../../lib/agent/team.ts',{zod:import.meta.resolve('zod')}),
 './work-tools':await load('../../lib/agent/work-tools.ts',{zod:import.meta.resolve('zod'),'@/lib/workspace':await load('../../lib/workspace.ts',{zod:import.meta.resolve('zod')})}),
 './order-actions':moduleUrl('export const createOrderPreparation=()=>({tools:[],proposals:[]});'),
 './navigation':moduleUrl('export const crmNavigationTools=()=>[];export const executeCrmNavigation=()=>{throw new Error("unexpected")};'),
 './operator-activity':await load('../../lib/agent/operator-activity.ts',{'@/lib/crm-operator':operator}),'@/lib/crm-operator':operator,
 '@/lib/credits/server':moduleUrl('export class CreditError extends Error{};export const reserveMessage=async()=>"turn";export const finishMessage=async()=>{};'),
 '@/lib/jarvis':await load('../../lib/jarvis.ts'),'@/lib/jarvis-personalization':await load('../../lib/jarvis-personalization.ts'),
 '@/lib/files/tools':moduleUrl('export const FILE_TOOLS=[];export const fileContext=()=>"";export const executeFileTool=()=>{throw new Error("unexpected")};'),
}));
test('NEXO delegates a real task proposal, emits approval_required and never confirms or schedules it through model tools',async()=>{
 const events=[];for await(const e of createAgentExecutor({tenantId:tenant,userId:user,role:'owner',sessionId:'task-flow',userMessage:'Recuérdame revisar el CRM mañana a las 9 hora Bogotá'}))events.push(e);
 assert.equal(events.at(-1).status,'completed');assert.deepEqual(calls.map(c=>c.name),['nexo_propose_work']);assert.equal(calls[0].args.p_tenant,tenant);assert.equal(calls[0].args.p_user,user);
 assert.equal(events.at(-1).handoffs[0].agent,'seguimiento');assert.ok(events.at(-1).operatorActions.some(a=>a.tool==='propose_crm_task'&&a.status==='approval_required'));
 assert.ok(rows.at(-1).metadata.operatorActions.some(a=>a.status==='approval_required'));assert.match(events.at(-1).content,/Confirmar/);
});
