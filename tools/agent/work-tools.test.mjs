import assert from 'node:assert/strict';
import {test} from 'node:test';
import {load} from './load.mjs';
const shared=await load('../../lib/workspace.ts',{zod:import.meta.resolve('zod')});
const {workTools,executeWorkTool}=await import(await load('../../lib/agent/work-tools.ts',{zod:import.meta.resolve('zod'),'@/lib/workspace':shared}));
const tenant=crypto.randomUUID(),user=crypto.randomUUID(),customer=crypto.randomUUID();
function context(role='owner'){
 const calls=[];const q={select(...a){calls.push(['select',...a]);return q;},eq(...a){calls.push(['eq',...a]);return q;},or(...a){calls.push(['or',...a]);return q;},order(){return q;},limit(n){calls.push(['limit',n]);return q;},abortSignal(){return q;},then(resolve){return Promise.resolve({data:[],count:0,error:null}).then(resolve);}};
 return {calls,tenantId:tenant,role,userId:user,sessionId:'work-session',requestKey:crypto.randomUUID(),supabase:{from(table){calls.push(['from',table]);return q;},rpc(name,args){calls.push(['rpc',name,args]);return {abortSignal:async()=>({data:{id:crypto.randomUUID(),...args.p_input,status:'proposed'},error:null})};}}};
}
test('viewers can read but never prepare; guests have no tools and there is no model confirmation tool',async()=>{
 assert.equal(workTools().length,0);assert.equal(workTools(tenant,'viewer').length,2);
 for(const role of ['owner','agent','viewer'])assert.ok(workTools(tenant,role).every(t=>!/(confirm|delete|complete|change)/.test(t.function.name)));
 const ctx=context('viewer');assert.equal((await executeWorkTool('propose_crm_task',{title:'X'},ctx)).ok,false);assert.equal(ctx.calls.length,0);
});
test('memory searches always filter active records in the authenticated tenant and sanitize query syntax',async()=>{
 const ctx=context();const result=await executeWorkTool('search_business_memory',{query:'Ana%,tenant_id.eq.foo',customer_id:customer},ctx);
 assert.equal(result.ok,true);assert.ok(ctx.calls.some(c=>c[0]==='eq'&&c[1]==='tenant_id'&&c[2]===tenant));assert.ok(ctx.calls.some(c=>c[1]==='status'&&c[2]==='active'));
 assert.equal(ctx.calls.find(c=>c[0]==='or')[1],'title.ilike.%Ana tenant id eq foo%,body.ilike.%Ana tenant id eq foo%');
});
test('task proposal gets actor/session/business only from server and remains pending human confirmation',async()=>{
 const ctx=context();const result=await executeWorkTool('propose_crm_task',{title:'Revisar pedido',due_at:new Date(Date.now()+86400000).toISOString(),timezone:'America/Bogota'},ctx);
 assert.equal(result.ok,true);assert.equal(result.data.requires_click_confirmation,true);assert.equal(result.data.saved_as_active,false);
 const rpc=ctx.calls.find(c=>c[0]==='rpc');assert.equal(rpc[1],'nexo_propose_work');assert.equal(rpc[2].p_tenant,tenant);assert.equal(rpc[2].p_user,user);assert.equal(rpc[2].p_session,'work-session');
});
test('fabricated tenant/role, ambiguous dates and invalid timezone are rejected before database writes',async()=>{
 for(const args of [{title:'X',tenant_id:crypto.randomUUID()},{title:'X',role:'owner'},{title:'X',due_at:'mañana'},{title:'X',due_at:new Date(Date.now()+86400000).toISOString(),timezone:'Bogota'}]){
  const ctx=context();assert.equal((await executeWorkTool('propose_crm_task',args,ctx)).ok,false);assert.equal(ctx.calls.length,0);
 }
});
