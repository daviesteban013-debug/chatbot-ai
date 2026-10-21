import assert from "node:assert/strict";
import {beforeEach,test} from "node:test";
import {load,moduleUrl} from "../agent/load.mjs";
const tenant=crypto.randomUUID(),uid=crypto.randomUUID();
let state;
const cloud=moduleUrl(`export const verifyCloudPhone=async(...args)=>{globalThis.__waState.verify.push(args);return {display_phone_number:'+573000000000'}};
export class CloudSetupError extends Error{constructor(code){super(code);this.code=code}}
export const activateCloudPhone=async(...args)=>{globalThis.__waState.activate.push(args);if(globalThis.__waState.pinMismatch&&args[3]!==undefined)throw new CloudSetupError('PIN_MISMATCH')};
export const exchangeSignupCode=async code=>{globalThis.__waState.exchange.push(code);if(globalThis.__waState.exchangeFails)throw new CloudSetupError('SIGNUP_CODE_INVALID');return 'fixture-business-token'};
export const generateTwoStepPin=()=>'246810';
export const cloudErrorMessage=()=> 'Provider operation failed';`);
const {GET,POST}=await import(await load('../../app/api/whatsapp/setup/route.ts',{
 zod:import.meta.resolve('zod'),
 '@/lib/auth':moduleUrl('export const getCurrentUser=async()=>globalThis.__waState.user;export const getCurrentTenant=async()=>globalThis.__waState.tenant;'),
 '@/lib/supabase/server':moduleUrl('export const createClient=async()=>({});'),
 '@/lib/supabase/admin':moduleUrl('export const createAdminClient=()=>globalThis.__waAdmin();'),
 '@/lib/whatsapp/cloud':cloud,
 '@/lib/whatsapp/credentials':moduleUrl('export const encryptWhatsAppToken=()=>"wa.v1.fixture-encrypted";export const loadWhatsAppSendOptions=async()=>({accessToken:"fixture-stored-token"});'),
 '@/lib/whatsapp/setup':moduleUrl('export const signupConfig=()=>globalThis.__waState.signup;export const setupRequirements=()=>[{name:"TEST",ready:globalThis.__waState.ready}];export const readWhatsAppSetup=async(_,tid,owner)=>({account:{phone_number_id:"123456789"},canManage:owner});'),
}));
beforeEach(()=>{state={user:{id:uid},tenant:{tenantId:tenant,role:'owner'},ready:true,verify:[],activate:[],rpc:[],exchange:[],updates:[],signup:{appId:'987654321',configId:'111222333',version:'v26.0'},membership:'owner'};globalThis.__waState=state;});
globalThis.__waAdmin=()=>({
 rpc:async(name,args)=>{state.rpc.push({name,args});return {data:crypto.randomUUID(),error:state.error};},
 from(table){const q={select(){return q},update(values){state.updates.push({table,values});return q},eq(){return q},maybeSingle:async()=>({data:table==='tenant_members'?{role:state.membership}:{phone_number_id:'123456789',waba_id:'987654321'},error:null})};return q;},
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
test('the Meta button: the code is exchanged on the server, the number saved, registered with a generated PIN, and the PIN stored encrypted',async()=>{
 const body={operation:'signup',code:'AQB-fixture-code-1234567890',phoneId:'123456789',wabaId:'987654321'};
 const response=await POST(req(body));assert.equal(response.status,200);
 assert.deepEqual(state.exchange,['AQB-fixture-code-1234567890']);
 assert.deepEqual(state.verify[0],['987654321','123456789','fixture-business-token']);
 assert.equal(state.rpc[0].args.p_tenant,tenant);assert.equal(state.rpc[0].args.p_ciphertext,'wa.v1.fixture-encrypted');
 assert.deepEqual(state.activate[0],['987654321','123456789','fixture-business-token','246810']);
 assert.deepEqual(state.updates[0],{table:'whatsapp_accounts',values:{two_step_pin_enc:'wa.v1.fixture-encrypted'}});
 const text=await response.text();assert.ok(text.includes('246810'));assert.ok(!text.includes('fixture-business-token'));
 assert.equal((await POST(req({...body,code:'short'}))).status,400);
 assert.equal((await POST(req({...body,accessToken:'fixture-token-long-enough'}))).status,400,'a token cannot ride along with the code');
 state.signup=null;assert.equal((await POST(req(body))).status,503);assert.equal(state.exchange.length,1);
});
test('a number that already has a two-step PIN is linked and subscribed anyway; a rejected code is a provider error',async()=>{
 const body={operation:'signup',code:'AQB-fixture-code-1234567890',phoneId:'123456789',wabaId:'987654321'};
 state.pinMismatch=true;const response=await POST(req(body));assert.equal(response.status,200);
 const data=await response.json();assert.equal(data.pinPending,true);assert.equal(data.pin,undefined);
 assert.equal(state.activate.length,2);assert.equal(state.activate[1][3],undefined);assert.equal(state.updates.length,0);
 state.pinMismatch=false;state.exchangeFails=true;assert.equal((await POST(req(body))).status,502);assert.equal(state.rpc.length,1);
});
