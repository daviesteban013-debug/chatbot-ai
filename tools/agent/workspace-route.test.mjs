import assert from 'node:assert/strict';
import { beforeEach,test } from 'node:test';
import {load,moduleUrl} from './load.mjs';
const shared=await load('../../lib/workspace.ts',{zod:import.meta.resolve('zod')});
const user=crypto.randomUUID(),tenant=crypto.randomUUID(),id=crypto.randomUUID();let state;
beforeEach(()=>{state={user:{id:user},role:'owner',calls:[],queries:[],error:null};});
globalThis.__workApiClient=()=>({auth:{getUser:async()=>({data:{user:state.user}})},from(table){
 const filters=[];state.queries.push({table,filters});const q={select(){return q;},eq(...a){filters.push(a);return q;},gt(){return q;},in(){return q;},order(){return q;},range(){return q;},limit(){return q;},then(resolve){return Promise.resolve({data:[],count:0,error:state.error}).then(resolve);}};return q;
},rpc:async(name,args)=>{state.calls.push({name,args});return {data:{id,status:'active'},error:state.error};}});
globalThis.__workApiTenant=()=>state.user?{tenantId:tenant,role:state.role,tenant:{name:'Fixture'}}:null;
const {GET,POST,PATCH}=await import(await load('../../app/api/workspace/route.ts',{
 'next/server':moduleUrl('export const NextResponse={json:(data,init)=>Response.json(data,init)};'),zod:import.meta.resolve('zod'),
 '@/lib/workspace':shared,'@/lib/supabase/server':moduleUrl('export const createClient=async()=>globalThis.__workApiClient();'),
 '@/lib/supabase/admin':moduleUrl('export const createAdminClient=()=>globalThis.__workApiClient();'),
 '@/lib/auth':moduleUrl('export const getCurrentTenant=async()=>globalThis.__workApiTenant();'),
}));
const origin='https://nexo.test';
const proposal={requestKey:crypto.randomUUID(),input:{kind:'memory',title:'Entrega',body:'Mañana'}};
const decision={id,revision:1,action:'confirm'};
function req(body=proposal,options={}){const r=new Request(origin+'/api/workspace',{method:options.method??'POST',headers:{origin,'content-type':'application/json',...options.headers},body:JSON.stringify(body)});r.nextUrl=new URL(r.url);return r;}
test('only same-origin authenticated writers can prepare or activate work',async()=>{
 for(const headers of [{origin:'https://evil.test'},{origin:'null'},{'sec-fetch-site':'cross-site'}]){assert.equal((await POST(req(proposal,{headers}))).status,403);assert.equal((await PATCH(req(decision,{headers}))).status,403);}
 state.user=null;assert.equal((await POST(req())).status,401);
 state.user={id:user,is_anonymous:true};assert.equal((await POST(req())).status,401);
 state.user={id:user};state.role='viewer';assert.equal((await POST(req())).status,403);assert.equal((await PATCH(req(decision))).status,403);assert.equal(state.calls.length,0);
});
test('business, actor and source cannot be supplied by the browser; decision is a separate human endpoint',async()=>{
 assert.equal((await POST(req({...proposal,tenantId:crypto.randomUUID()}))).status,400);
 assert.equal((await PATCH(req({...decision,user_id:crypto.randomUUID()}))).status,400);
 assert.equal((await POST(req())).status,200);assert.equal(state.calls[0].name,'nexo_propose_work');assert.equal(state.calls[0].args.p_tenant,tenant);assert.equal(state.calls[0].args.p_user,user);assert.equal(state.calls[0].args.p_session,null);
 assert.equal((await PATCH(req(decision))).status,200);assert.equal(state.calls[1].name,'nexo_change_work');assert.equal(state.calls[1].args.p_user,user);
});
test('reads are tenant filtered and proposal ownership is explicit; raw database failures stay private',async()=>{
 const r={nextUrl:new URL(origin+'/api/workspace?tab=proposed')};assert.equal((await GET(r)).status,200);
 const q=state.queries.find(q=>q.table==='nexo_work_items');assert.ok(q.filters.some(([k,v])=>k==='tenant_id'&&v===tenant));assert.ok(q.filters.some(([k,v])=>k==='created_by'&&v===user));
 state.error={message:'private fixture credential'};const response=await PATCH(req(decision));assert.equal(response.status,409);assert.doesNotMatch(await response.text(),/private fixture/);
});
test('streamed request bounds use actual UTF-8 bytes even if Content-Length is false',async()=>{
 const response=await POST(req({requestKey:proposal.requestKey,input:{kind:'memory',title:'Límite',body:'é'.repeat(20000)}},{headers:{'content-length':'1'}}));
 assert.equal(response.status,413);assert.equal(state.calls.length,0);
 assert.equal((await POST(req(proposal,{headers:{'content-length':'1000000'}}))).status,413);
});
