import assert from "node:assert/strict";
import {beforeEach,test} from "node:test";
import {load,moduleUrl} from "../agent/load.mjs";
const tenant=crypto.randomUUID(),uid=crypto.randomUUID();
let state;
const cloud=moduleUrl(`export const verifyCloudPhone=async(...args)=>{globalThis.__waState.verify.push(args);return {display_phone_number:'+573000000000'}};
export const activateCloudPhone=async(...args)=>{globalThis.__waState.activate.push(args)};
export const cloudErrorMessage=()=> 'Provider operation failed';`);
const {GET,POST}=await import(await load('../../app/api/whatsapp/setup/route.ts',{
 zod:import.meta.resolve('zod'),
 '@/lib/auth':moduleUrl('export const getCurrentUser=async()=>globalThis.__waState.user;export const getCurrentTenant=async()=>globalThis.__waState.tenant;'),
 '@/lib/supabase/server':moduleUrl('export const createClient=async()=>({});'),
 '@/lib/supabase/admin':moduleUrl('export const createAdminClient=()=>globalThis.__waAdmin();'),
 '@/lib/whatsapp/cloud':cloud,
 '@/lib/whatsapp/credentials':moduleUrl('export const encryptWhatsAppToken=()=>"wa.v1.fixture-encrypted";export const loadWhatsAppSendOptions=async()=>({accessToken:"fixture-stored-token"});'),
 '@/lib/whatsapp/setup':moduleUrl('export const setupRequirements=()=>[{name:"TEST",ready:globalThis.__waState.ready}];export const readWhatsAppSetup=async(_,tid,owner)=>({account:{phone_number_id:"123456789"},canManage:owner});'),
}));
beforeEach(()=>{state={user:{id:uid},tenant:{tenantId:tenant,role:'owner'},ready:true,verify:[],activate:[],rpc:[],membership:'owner'};globalThis.__waState=state;});
globalThis.__waAdmin=()=>({
 rpc:async(name,args)=>{state.rpc.push({name,args});return {data:crypto.randomUUID(),error:state.error};},
 from(table){const q={select(){return q},eq(){return q},maybeSingle:async()=>({data:table==='tenant_members'?{role:state.membership}:{phone_number_id:'123456789',waba_id:'987654321'},error:null})};return q;},
});
const req=(body={operation:'save',phoneId:'123456789',wabaId:'987654321',accessToken:'fixture-token-long-enough'},origin='https://nexo.test')=>new Request('https://nexo.test/api/whatsapp/setup',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});
test('missing login, anonymous sessions, non-owners and cross-origin writes are blocked before Meta',async()=>{
 assert.equal((await POST(req(undefined,'https://evil.test'))).status,403);
 state.user=null;assert.equal((await GET()).status,401);assert.equal((await POST(req())).status,401);
 state.user={id:uid,is_anonymous:true};assert.equal((await POST(req())).status,401);
 state.user={id:uid};state.tenant.role='agent';assert.equal((await POST(req())).status,403);
 state.tenant.role='viewer';assert.equal((await POST(req())).status,403);
 assert.equal(state.verify.length,0);assert.equal(state.rpc.length,0);
});
test('identity cannot be supplied by browser; provider validation precedes encrypted server save',async()=>{
 assert.equal((await POST(req({operation:'save',phoneId:'123456789',wabaId:'987654321',accessToken:'fixture-token-long-enough',tenantId:crypto.randomUUID()}))).status,400);
 const response=await POST(req());assert.equal(response.status,200);assert.equal(state.verify.length,1);
 assert.equal(state.rpc[0].args.p_tenant,tenant);assert.equal(state.rpc[0].args.p_user,uid);
 assert.equal(state.rpc[0].args.p_ciphertext,'wa.v1.fixture-encrypted');assert.ok(!(await response.text()).includes('fixture-token'));
});
test('missing server requirements and database failures are useful without exposing secrets',async()=>{
 state.ready=false;assert.equal((await POST(req())).status,503);assert.equal(state.verify.length,0);
 state.ready=true;state.error={code:'23505',message:'private database error fixture-token'};
 const response=await POST(req());assert.equal(response.status,409);assert.ok(!(await response.text()).includes('fixture-token'));
});
test('registration and subscription use saved assets, never actor/assets from client, and recheck owner',async()=>{
 assert.equal((await POST(req({operation:'register',pin:'123456',phoneId:'5555566666'}))).status,400);
 assert.equal((await POST(req({operation:'register',pin:'123456'}))).status,200);
 assert.deepEqual(state.activate[0],['987654321','123456789','fixture-stored-token','123456']);
 assert.equal((await POST(req({operation:'subscribe'}))).status,200);assert.equal(state.activate[1][3],undefined);
 state.membership='viewer';assert.equal((await POST(req({operation:'subscribe'}))).status,403);assert.equal(state.activate.length,2);
});
