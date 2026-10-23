import assert from "node:assert/strict";
import {beforeEach,test} from "node:test";
import {load,moduleUrl} from "../agent/load.mjs";
const tenant=crypto.randomUUID(),uid=crypto.randomUUID();
let state;
const cloud=moduleUrl(`export const verifyCloudPhone=async(...args)=>{globalThis.__waState.verify.push(args);return {display_phone_number:'+573000000000'}};
export class CloudSetupError extends Error{constructor(code){super(code);this.code=code}}
export const activateCloudPhone=async(...args)=>{globalThis.__waState.activate.push(args);if(globalThis.__waState.registerFails&&args[3]!==undefined)throw new CloudSetupError(globalThis.__waState.registerFails)};
export const exchangeSignupCode=async code=>{globalThis.__waState.exchange.push(code);if(globalThis.__waState.exchangeFails)throw new CloudSetupError('SIGNUP_CODE_INVALID');return 'fixture-business-token'};
export const generateTwoStepPin=()=>'246810';
export const onlyCloudPhoneId=async(...args)=>{globalThis.__waState.onlyPhone.push(args);return '555000111'};
export const requestAppDataSync=async(...args)=>{globalThis.__waState.syncs.push(args);if(globalThis.__waState.syncFails===args[2])throw new CloudSetupError('META_UNAVAILABLE')};
export const cloudErrorMessage=()=> 'Provider operation failed';`);
const {GET,POST}=await import(await load('../../app/api/whatsapp/setup/route.ts',{
 zod:import.meta.resolve('zod'),
 '@/lib/auth':moduleUrl('export const getCurrentUser=async()=>globalThis.__waState.user;export const getCurrentTenant=async()=>globalThis.__waState.tenant;'),
 '@/lib/supabase/server':moduleUrl('export const createClient=async()=>({});'),
 '@/lib/supabase/admin':moduleUrl('export const createAdminClient=()=>globalThis.__waAdmin();'),
 '@/lib/whatsapp/cloud':cloud,
 '@/lib/whatsapp/credentials':moduleUrl('export const encryptWhatsAppToken=()=>"wa.v1.fixture-encrypted";export const loadWhatsAppSendOptions=async()=>({accessToken:"fixture-stored-token"});'),
 '@/lib/whatsapp/setup':moduleUrl('export const APP_SYNC_WINDOW_MS=86400000;export const signupConfig=()=>globalThis.__waState.signup;export const setupRequirements=()=>[{name:"TEST",ready:globalThis.__waState.ready}];export const readWhatsAppSetup=async(_,tid,owner)=>({account:{phone_number_id:"123456789"},canManage:owner});'),
}));
beforeEach(()=>{state={user:{id:uid},tenant:{tenantId:tenant,role:'owner'},ready:true,verify:[],activate:[],rpc:[],exchange:[],updates:[],onlyPhone:[],syncs:[],syncFails:null,appLinkedAt:null,signup:{appId:'987654321',configId:'111222333',version:'v26.0'},membership:'owner'};globalThis.__waState=state;});
globalThis.__waAdmin=()=>({
 rpc:async(name,args)=>{state.rpc.push({name,args});return {data:crypto.randomUUID(),error:state.error};},
 from(table){const q={select(){return q},update(values){state.updates.push({table,values});return q},eq(){return q},maybeSingle:async()=>({data:table==='tenant_members'?{role:state.membership}:{phone_number_id:'123456789',waba_id:'987654321',app_linked_at:state.appLinkedAt},error:null})};return q;},
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
 assert.deepEqual(state.verify[0],['987654321','123456789','fixture-business-token',{requireVerified:true}]);
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
 state.registerFails="PIN_MISMATCH";const response=await POST(req(body));assert.equal(response.status,200);
 const data=await response.json();assert.equal(data.pinPending,true);assert.equal(data.pin,undefined);
 assert.equal(state.activate.length,2);assert.equal(state.activate[1][3],undefined);assert.equal(state.updates.length,0);
 // A number that keeps the WhatsApp Business app is already registered by Meta: linked and subscribed, nothing left to type.
 state.registerFails="REGISTRATION_FAILED";state.activate=[];state.rpc=[];const kept=await POST(req(body));assert.equal(kept.status,200);
 const keptData=await kept.json();assert.equal(keptData.pinPending,undefined);assert.equal(keptData.pin,undefined);assert.match(keptData.message,/conectado/);
 assert.equal(state.activate.length,2);assert.equal(state.activate[1][3],undefined);assert.equal(state.updates.length,0);
 state.registerFails=null;state.exchangeFails=true;assert.equal((await POST(req(body))).status,502);assert.equal(state.rpc.length,1);
});

test('linking the WhatsApp Business app: the one number of the account is found, linked and subscribed, never re-registered',async()=>{
 const body={operation:'signup',code:'AQB-fixture-code-1234567890',wabaId:'987654321',coexistence:true};
 const response=await POST(req(body));assert.equal(response.status,200);
 assert.deepEqual(state.onlyPhone,[['987654321','fixture-business-token']]);
 assert.deepEqual(state.verify[0],['987654321','555000111','fixture-business-token',{requireVerified:false}]);
 assert.equal(state.rpc[0].args.p_phone,'555000111');
 assert.equal(state.activate.length,1);assert.equal(state.activate[0][3],undefined,'no PIN registration for a linked app');
 assert.deepEqual(state.activate[0][4],{requireVerified:false});
 // Linking opens Meta's 24-hour window: contacts are asked first, then the chats, and each request is recorded.
 assert.ok(state.updates[0].values.app_linked_at);assert.equal(state.updates[0].values.history_sync_requested_at,null);assert.equal(state.updates[0].values.history_sync_declined,false);
 assert.deepEqual(state.syncs,[['555000111','fixture-business-token','smb_app_state_sync'],['555000111','fixture-business-token','history']]);
 assert.ok(state.updates[1].values.contacts_sync_requested_at);assert.ok(state.updates[2].values.history_sync_requested_at);assert.equal(state.updates.length,3);
 const data=await response.json();assert.equal(data.pin,undefined);assert.match(data.message,/WhatsApp Business/);assert.match(data.message,/trayendo tus contactos y tus chats/);
 // With the phone ID present it is used as given.
 state.onlyPhone=[];state.verify=[];assert.equal((await POST(req({...body,phoneId:'123456789'}))).status,200);
 assert.equal(state.onlyPhone.length,0);assert.equal(state.verify[0][1],'123456789');
});
test('if Meta refuses the history request the app stays linked and the owner is told how to retry in time',async()=>{
 state.syncFails='history';
 const response=await POST(req({operation:'signup',code:'AQB-fixture-code-1234567890',wabaId:'987654321',coexistence:true}));
 assert.equal(response.status,200);assert.match((await response.json()).message,/Traer mis chats/);
 assert.equal(state.syncs.length,2);assert.ok(state.updates.some(update=>update.values.contacts_sync_requested_at));
 assert.ok(!state.updates.some(update=>update.values.history_sync_requested_at),'a refused request is not recorded as asked');
});
test('retrying the chat import works only for a linked app, inside 24 hours, with the saved token and a rechecked owner',async()=>{
 assert.equal((await POST(req({operation:'sync',phoneId:'5555566666'}))).status,400,'no IDs from the browser');
 assert.equal((await POST(req({operation:'sync'}))).status,409,'a number connected without the app has nothing to import');
 state.appLinkedAt=new Date(Date.now()-25*3600*1000).toISOString();assert.equal((await POST(req({operation:'sync'}))).status,409);
 assert.equal(state.syncs.length,0);
 state.appLinkedAt=new Date(Date.now()-3600*1000).toISOString();state.membership='viewer';
 assert.equal((await POST(req({operation:'sync'}))).status,403);assert.equal(state.syncs.length,0);
 state.membership='owner';const response=await POST(req({operation:'sync'}));assert.equal(response.status,200);
 assert.deepEqual(state.syncs.map(sync=>sync[2]),['smb_app_state_sync','history']);assert.equal(state.syncs[0][1],'fixture-stored-token');
 state.syncs=[];state.syncFails='smb_app_state_sync';assert.equal((await POST(req({operation:'sync'}))).status,502);
});
test('a new number needs its ID, and the coexistence flag must be a real boolean; both are checked before the code is spent',async()=>{
 assert.equal((await POST(req({operation:'signup',code:'AQB-fixture-code-1234567890',wabaId:'987654321'}))).status,400);
 assert.equal((await POST(req({operation:'signup',code:'AQB-fixture-code-1234567890',wabaId:'987654321',coexistence:'yes'}))).status,400);
 assert.equal(state.exchange.length,0);
});
