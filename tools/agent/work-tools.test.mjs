import assert from 'node:assert/strict';
import {test} from 'node:test';
import {load} from './load.mjs';
const shared=await load('../../lib/workspace.ts',{zod:import.meta.resolve('zod')});
const {workTools,executeWorkTool,createBusinessFactSaver}=await import(await load('../../lib/agent/work-tools.ts',{zod:import.meta.resolve('zod'),'@/lib/workspace':shared}));
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
 const rpc=ctx.calls.find(c=>c[0]==='rpc');assert.equal(rpc[1],'nexo_propose_work_by_nexo');assert.equal(rpc[2].p_tenant,tenant);assert.equal(rpc[2].p_user,user);assert.equal(rpc[2].p_session,'work-session');
});
test('fabricated tenant/role, ambiguous dates and invalid timezone are rejected before database writes',async()=>{
 for(const args of [{title:'X',tenant_id:crypto.randomUUID()},{title:'X',role:'owner'},{title:'X',due_at:'mañana'},{title:'X',due_at:new Date(Date.now()+86400000).toISOString(),timezone:'Bogota'}]){
  const ctx=context();assert.equal((await executeWorkTool('propose_crm_task',args,ctx)).ok,false);assert.equal(ctx.calls.length,0);
 }
});
test('with memory and tasks autonomy, an activated item is reported as saved and undoable; descriptions say so only when enabled',async()=>{
 assert.doesNotMatch(workTools(tenant,'owner').map(t=>t.function.description).join(' '),/autorizó/);
 assert.match(workTools(tenant,'owner',true).find(t=>t.function.name==='propose_crm_task').function.description,/applied_automatically/);
 const ctx=context();const log=crypto.randomUUID();
 ctx.supabase.rpc=(name,args)=>({abortSignal:async()=>({data:{id:crypto.randomUUID(),...args.p_input,status:'active',auto:true,log_id:log},error:null})});
 const result=await executeWorkTool('propose_crm_task',{title:'Llamar a Ana',due_at:new Date(Date.now()+86400000).toISOString(),timezone:'America/Bogota'},ctx);
 assert.equal(result.data.applied_automatically,true);assert.equal(result.data.saved_as_active,true);assert.equal(result.data.activity_id,log);assert.equal('auto' in result.data.proposal,false);
});
test('business facts: only with the owner switch, only words the user said, never sensitive data, at most two per turn',async()=>{
 const rpc=[];const supabase={rpc(name,args){rpc.push({name,args});return {abortSignal:async()=>({data:{id:'m-'+rpc.length,title:args.p_input.title,status:'active',auto:true,log_id:'log-'+rpc.length,duplicate:rpc.length===3},error:null})};}};
 const message='Ojo: mi proveedor de tenis es Calzado Norte, entrega los martes. Mi clave del banco es 1234.';
 const make=(enabled=true,role='owner')=>createBusinessFactSaver({supabase,tenantId:tenant,role,userId:user,sessionId:'work-session',userMessage:message,enabled});
 assert.equal(make(false).tools.length,0);assert.equal(make(true,'viewer').tools.length,0);
 const saver=make();assert.deepEqual(saver.tools.map(t=>t.function.name),['save_business_fact']);
 assert.match((await saver.execute({title:'Proveedor de tenis: Calzado Norte',source_quote:'entrega los jueves'})).error,/no aparece en el mensaje/);
 assert.match((await saver.execute({title:'Clave del banco: 1234',source_quote:'mi clave del banco es 1234'})).error,/sensible/);
 assert.match((await saver.execute({title:'Teléfono del proveedor 3001234567',source_quote:'Calzado Norte'})).error,/sensible/);
 assert.equal(rpc.length,0);
 const first=await saver.execute({title:'Proveedor de tenis: Calzado Norte',body:'Entrega los martes',source_quote:'MI PROVEEDOR de tenis es «Calzado Norte»'});
 assert.equal(first.ok,true);assert.equal(first.data.applied_automatically,true);assert.equal(first.data.activity_id,'log-1');
 assert.deepEqual(rpc[0].args,{p_tenant:tenant,p_user:user,p_session:'work-session',p_key:rpc[0].args.p_key,p_input:{kind:'memory',title:'Proveedor de tenis: Calzado Norte',body:'Entrega los martes'}});
 await saver.execute({title:'Proveedor de tenis: Calzado Norte',body:'Entrega los martes',source_quote:'entrega los martes'});
 assert.equal(rpc[1].args.p_key,rpc[0].args.p_key,'the same fact reuses its key within the turn');
 const duplicate=await saver.execute({title:'Entrega: los martes',source_quote:'entrega los martes'});
 assert.equal(duplicate.data.duplicate,true);assert.equal(duplicate.data.applied_automatically,false);
 const third=await saver.execute({title:'Otro dato del proveedor',source_quote:'Calzado Norte'});
 assert.equal(third.ok,true,'a duplicate does not count toward the limit');
 assert.match((await saver.execute({title:'Y otro más',source_quote:'Calzado Norte'})).error,/dos hechos/);
 supabase.rpc=()=>({abortSignal:async()=>({data:null,error:{message:'MEMORY_DISABLED'}})});
 assert.match((await make().execute({title:'Proveedor',source_quote:'Calzado Norte'})).error,/no activó/);
 assert.match((await make(false).execute({title:'Proveedor',source_quote:'Calzado Norte'})).error,/no activó/);
});
