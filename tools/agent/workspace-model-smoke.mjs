import assert from 'node:assert/strict';
import nextEnv from '@next/env';
import {moduleUrl} from '../stripe/load-module.mjs';
// Real provider + bounded demo allowance; synthetic CRM and in-memory proposals.
// Never fetch customer records, persist work, print keys or send external messages.
nextEnv.loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const inline=s=>`data:text/javascript;base64,${Buffer.from(s).toString('base64')}`;
const tenant=crypto.randomUUID(),user=crypto.randomUUID(),proposals=[],rows=[],reads=[];
globalThis.__workspaceModelDb=()=>({from(table){let inserted;const filters={};const q={
  select(){return q;},eq(k,v){filters[k]=v;return q;},or(){return q;},order(){return q;},limit(){return q;},abortSignal(){return q;},
  insert(row){inserted=row;rows.push(row);return q;},maybeSingle:async()=>({data:table==='tenant_members'?{role:'owner'}:null,error:null}),single:async()=>({data:{id:'synthetic-message'},error:null}),
  then(resolve,reject){if(table==='nexo_work_items'){assert.equal(filters.tenant_id,tenant);assert.equal(filters.status,'active');reads.push(table);}
    return Promise.resolve({data:inserted?null:table==='nexo_work_items'?[{id:crypto.randomUUID(),kind:'memory',title:'Horario sintético',body:'El negocio de prueba abre a las 9.',status:'active',confirmed_by:user,updated_at:new Date().toISOString()}]:[],count:table==='nexo_work_items'?1:0,error:null}).then(resolve,reject);},
 };return q;},rpc(name,args){assert.equal(name,'nexo_propose_work');assert.equal(args.p_tenant,tenant);assert.equal(args.p_user,user);
 const proposal={id:crypto.randomUUID(),status:'proposed',created_by:user,...args.p_input};proposals.push(proposal);
 const p=Promise.resolve({data:proposal,error:null});p.abortSignal=()=>p;return p;}});
let stage='modules';
try{
 const metered=await moduleUrl('lib/llm/metered.ts'),credits=await moduleUrl('lib/credits/server.ts');
 const {createAgentExecutor}=await import(await moduleUrl('lib/agent/executor.ts',{
  '@/lib/supabase/admin':inline('export const createAdminClient=()=>globalThis.__workspaceModelDb();'),
  '@/lib/llm':await moduleUrl('lib/llm/client.ts'),
  '@/lib/llm/metered':inline(`import {meteredChatCompletion as c,meteredChatCompletionStream as s} from ${JSON.stringify(metered)};export const meteredChatCompletion=(a,...b)=>c({channel:'web',messageReservationId:a.messageReservationId},...b);export const meteredChatCompletionStream=(a,...b)=>s({channel:'web',messageReservationId:a.messageReservationId},...b);`),
  './web-tools':inline('export const webCrmTools=()=>[];export const executeWebToolCall=()=>{throw new Error("Unexpected CRM tool")};'),
  './order-actions':inline('export const createOrderPreparation=()=>({tools:[],proposals:[]});'),
  '@/lib/credits/server':inline(`import {CreditError,inputReservation,reserveMessage as r,finishMessage} from ${JSON.stringify(credits)};export {CreditError,inputReservation,finishMessage};export const reserveMessage=()=>r({channel:'web'});`),
 }));
 stage='execute';const events=[];
 for await(const e of createAgentExecutor({tenantId:tenant,userId:user,role:'owner',sessionId:'synthetic-workspace-smoke',
  userMessage:`Consulta la memoria confirmada sobre el horario del negocio de prueba. Después prepara una tarea interna para revisar el CRM el ${new Date(Date.now()+86400000).toISOString()}, zona America/Bogota, asignada a mí. No actives la tarea: indícame dónde revisar y confirmar la propuesta.`,
 }))events.push(e);
 stage='assert';const final=events.at(-1);assert.equal(final?.status,'completed');assert.ok(reads.length>0);
 assert.equal(proposals.length,1);assert.equal(proposals[0].kind,'task');assert.equal(proposals[0].status,'proposed');
 assert.ok(final.operatorActions.some(a=>a.tool==='propose_crm_task'&&a.status==='approval_required'));
 assert.match(final.content,/confirm|propuesta|revis/i);
 console.log(JSON.stringify({ok:true,synthetic:true,confirmedMemoryRead:true,taskProposals:proposals.length,activeTasksCreated:0,modelCalls:rows.at(-1).metadata.modelCalls,tokensIn:rows.at(-1).tokens_in,tokensOut:rows.at(-1).tokens_out,latencyMs:final.latencyMs}));
}catch{console.error(JSON.stringify({ok:false,stage}));process.exitCode=1;}
