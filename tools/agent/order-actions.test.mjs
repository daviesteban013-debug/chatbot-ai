import assert from 'node:assert/strict';
import {beforeEach,test} from 'node:test';
import {load,moduleUrl} from './load.mjs';
const shared=await load('../../lib/order-proposals.ts',{zod:import.meta.resolve('zod')});
const {createOrderPreparation}=await import(await load('../../lib/agent/order-actions.ts',{'@/lib/order-proposals':shared}));
const {GET,POST}=await import(await load('../../app/api/jarvis/order-proposals/route.ts',{
 'next/server':moduleUrl('export const NextResponse={json:(data,init)=>Response.json(data,init)};'),
 '@/lib/supabase/server':moduleUrl('export const createClient=async()=>globalThis.__proposalClient();'),
 '@/lib/supabase/admin':moduleUrl('export const createAdminClient=()=>globalThis.__proposalAdmin();'),
 '@/lib/order-proposals':shared,
}));
const id=crypto.randomUUID(),uid=crypto.randomUUID(),tenant=crypto.randomUUID(),customer=crypto.randomUUID();
const proposal={id,session_id:'session-fixture',status:'pending',expires_at:new Date(Date.now()+900000).toISOString(),order_id:null,handoff_id:null,snapshot:{customer_id:customer,customer_name:'Ana',currency:'COP',fulfillment:'unassigned',subtotal:12000,total:12000,items:[{variant_id:crypto.randomUUID(),sku:'SKU-1',name:'Prueba',qty:1,unit_price:12000}]}};
let state;
beforeEach(()=>{state={user:{id:uid},calls:[],error:null,filters:[]};});
globalThis.__proposalAdmin=()=>({rpc(name,args){state.calls.push({name,args});const result=Promise.resolve({data:{ok:true,proposal},error:state.error});result.abortSignal=()=>result;return result;}});
globalThis.__proposalClient=()=>({auth:{getUser:async()=>({data:{user:state.user}})},from(){const q={select(){return q;},eq(...args){state.filters.push(args);return q;},order(){return q;},limit:async()=>({data:[{...proposal,user_id:uid,request_key:'private'}],error:state.error})};return q;}});
const request=(body={id,decision:'confirm'},extra={})=>{const r=new Request('https://nexo.test/api/jarvis/order-proposals?sessionId=session-fixture',{method:'POST',headers:{origin:'https://nexo.test','content-type':'application/json',...extra},body:JSON.stringify(body)});r.nextUrl=new URL(r.url);return r;};
test('the model receives preparation only; server identity/session and canonical DB proposal prevail',async()=>{
 const action=createOrderPreparation({supabase:__proposalAdmin(),tenantId:tenant,userId:uid,sessionId:'session-fixture',role:'owner'});
 assert.deepEqual(action.tools.map(t=>t.function.name),['prepare_order_proposal']);const result=await action.execute({customer_id:customer,items:[{variant_sku:'SKU-1',qty:1}]});assert.equal(result.ok,true);assert.equal(result.data.order_created,false);assert.equal(result.data.stock_reserved,false);assert.equal(action.proposals[0].id,id);assert.equal(state.calls[0].args.p_user,uid);assert.equal(state.calls[0].args.p_tenant,tenant);
});
test('viewer/missing membership, invented price/identity and duplicate SKU arguments never invoke preparation',async()=>{
 for(const role of ['viewer',null]) {const a=createOrderPreparation({supabase:__proposalAdmin(),tenantId:tenant,userId:uid,sessionId:'session-fixture',role});assert.equal(a.tools.length,0);assert.equal((await a.execute({})).ok,false);}
 const a=createOrderPreparation({supabase:__proposalAdmin(),tenantId:tenant,userId:uid,sessionId:'session-fixture',role:'agent'});
 for(const args of [{customer_id:customer,items:[{variant_sku:'SKU-1',qty:1,unit_price:0}]},{customer_id:customer,p_user:uid,items:[{variant_sku:'SKU-1',qty:1}]},{customer_id:customer,items:[{variant_sku:'SKU-1',qty:1},{variant_sku:'SKU-1',qty:1}]}]) assert.equal((await a.execute(args)).ok,false);
 assert.equal(state.calls.length,0);
});
test('decisions require same-origin and real login; the caller cannot supply another actor',async()=>{
 assert.equal((await POST(request(undefined,{origin:'https://evil.test'}))).status,403);
 state.user=null;assert.equal((await POST(request())).status,401);state.user={id:uid,is_anonymous:true};assert.equal((await POST(request())).status,401);
 state.user={id:uid};assert.equal((await POST(request({id,decision:'confirm',p_user:crypto.randomUUID()}))).status,400);assert.equal(state.calls.length,0);
 const response=await POST(request());assert.equal(response.status,200);assert.equal(state.calls[0].args.p_user,uid);assert.equal(state.calls[0].name,'nexo_decide_order');
});
test('proposal reads filter session and user; private DB fields and raw errors never reach client',async()=>{
 const r=request();assert.equal((await GET(r)).status,200);assert.deepEqual(state.filters,[['user_id',uid],['session_id','session-fixture']]);const data=await (await GET(r)).json();assert.equal(data.proposals[0].request_key,undefined);assert.equal(data.proposals[0].user_id,undefined);
 state.error={message:'secret fixture database failure'};const response=await POST(r);assert.equal(response.status,409);assert.ok(!(await response.text()).includes('secret fixture'));
});
