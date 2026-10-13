import assert from 'node:assert/strict';
import {beforeEach,test} from 'node:test';
import {load,moduleUrl} from '../agent/load.mjs';
const tenant=crypto.randomUUID(),user=crypto.randomUUID();
let state;
globalThis.__budgetTenant=async()=>{if(state.authError)throw Error('PRIVATE_AUTH_DETAIL');return state.tenant;};
globalThis.__budgetRpc=(name,args)=>{state.calls.push({name,args});return {abortSignal(signal){assert.ok(signal instanceof AbortSignal);if(state.throws)return Promise.reject(Error('PRIVATE_DATABASE_DETAIL'));return Promise.resolve({error:state.error,data:name==='nexo_reserve_voice'?(state.response??{ok:true,requestId:args.p_id}):null});}};};
const {reserveSpeechBudget}=await import(await load('../../lib/voice/speech-budget.ts',{
 '@/lib/auth':moduleUrl('export const getCurrentTenant=()=>globalThis.__budgetTenant();'),
 '@/lib/supabase/admin':moduleUrl('export const createAdminClient=()=>({rpc:(...args)=>globalThis.__budgetRpc(...args)});'),
}));
beforeEach(()=>{state={tenant:{tenantId:tenant,role:'viewer'},calls:[],response:null,error:null};});
test('business scope comes from server membership, reservations are independent and completion happens once',async()=>{
 const a=await reserveSpeechBudget(user,45,'tts'),b=await reserveSpeechBudget(user,500,'stt');
 assert.equal(a.ok,true);assert.equal(b.ok,true);assert.notEqual(state.calls[0].args.p_id,state.calls[1].args.p_id);
 assert.deepEqual({...state.calls[0].args,p_id:'server-generated'},{p_id:'server-generated',p_user:user,p_tenant:tenant,p_channel:'tts',p_units:45});
 await a.finish('unknown');await a.finish('completed');
 const finish=state.calls.filter(c=>c.name==='nexo_finish_voice');assert.equal(finish.length,1);assert.equal(finish[0].args.p_id,state.calls[0].args.p_id);assert.equal(finish[0].args.p_user,user);assert.equal(finish[0].args.p_outcome,'unknown');
});
test('account without a business uses the private user bucket; no client-supplied owner is accepted',async()=>{
 state.tenant=null;assert.equal((await reserveSpeechBudget(user,10,'tts')).ok,true);assert.equal(state.calls[0].args.p_tenant,null);assert.equal(state.calls[0].args.p_user,user);
});
test('database unavailability and malformed receipts cannot fall back to process-local free voice',async()=>{
 for(const response of [null,[],{},true,{ok:true,requestId:'forged'},{ok:false,reason:'quota',retryAfterSeconds:0},{ok:false,reason:'quota',retryAfterSeconds:601},{ok:false,reason:'quota',retryAfterSeconds:NaN}]){
  state.response=response;state.error={message:'PRIVATE_DATABASE_DETAIL'};let r=await reserveSpeechBudget(user,10,'tts');assert.equal(r.status,503);assert.doesNotMatch(r.error,/PRIVATE/);
  state.error=null;if(response!==null){r=await reserveSpeechBudget(user,10,'tts');assert.equal(r.status,503);}
 }
 state.throws=true;assert.equal((await reserveSpeechBudget(user,10,'tts')).status,503);
 state.authError=true;state.calls=[];assert.equal((await reserveSpeechBudget(user,10,'tts')).status,503);assert.equal(state.calls.length,0);
});
test('quota and concurrency refusals report bounded recovery time without exposing private identifiers',async()=>{
 for(const reason of ['quota','busy','rate']){
  state.response={ok:false,reason,retryAfterSeconds:117};const r=await reserveSpeechBudget(user,10,'tts');assert.equal(r.status,429);assert.equal(r.retryAfterSeconds,117);assert.match(r.error,/texto/);assert.doesNotMatch(r.error,new RegExp(tenant+'|'+user));
 }
});
