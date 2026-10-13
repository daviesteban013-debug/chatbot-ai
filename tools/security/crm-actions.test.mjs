import assert from 'node:assert/strict';
import {beforeEach,test} from 'node:test';
import {load,moduleUrl} from '../agent/load.mjs';
let state;
const user=crypto.randomUUID(),tenant=crypto.randomUUID(),id=crypto.randomUUID();
beforeEach(()=>{state={user:{id:user},tenant:{tenantId:tenant,role:'viewer'},calls:[],sends:0};});
globalThis.__permissionUser=async()=>state.user;
globalThis.__permissionTenant=async()=>state.tenant;
globalThis.__permissionDb=(admin=false)=>({from(table){const call={table,admin,filters:[]};state.calls.push(call);const q={select(){return q},eq(...args){call.filters.push(args);return q},update(payload){call.update=payload;return q},upsert(){return q},maybeSingle:async()=>({data:{id,status:table==='handoffs'?'open':'proposed'},error:null}),then(resolve){return Promise.resolve({error:null}).then(resolve)}};return q;}});
const auth=moduleUrl('export const getCurrentUser=()=>globalThis.__permissionUser();export const getCurrentTenant=()=>globalThis.__permissionTenant();');
const server=moduleUrl('export const createClient=async()=>globalThis.__permissionDb(false);');
const admin=moduleUrl('export const createAdminClient=()=>globalThis.__permissionDb(true);');
const common={
 'next/cache':moduleUrl('export const revalidatePath=()=>{};'),
 '@/lib/auth':auth,'@/lib/supabase/server':server,'@/lib/supabase/admin':admin,
 '@/lib/whatsapp/credentials':moduleUrl('export const loadWhatsAppSendOptions=async()=>null;'),
 '@/lib/whatsapp/send':moduleUrl('export const sendText=async()=>{throw Error("UNEXPECTED_SEND")};export const isWithinServiceWindow=()=>true;'),
};
const approval=await import(await load('../../app/dashboard/approval/actions.ts',common));
const handoffs=await import(await load('../../app/dashboard/handoffs/actions.ts',common));
const jarvis=await import(await load('../../app/dashboard/jarvis/actions.ts',{
 '@/lib/auth':auth,'@/lib/supabase/server':server,
 '@/lib/jarvis':moduleUrl('export const sanitizeJarvisConfig=v=>v;'),
 '@/lib/jarvis-personalization':moduleUrl('export const sanitizePersonalization=v=>v;'),
}));
const actions=[()=>approval.approveReply(id),()=>approval.editAndApproveReply(id,'Fixture'),()=>approval.rejectReply(id),()=>approval.approveOrder(id),()=>approval.rejectOrder(id),()=>handoffs.takeHandoff(id),()=>handoffs.sendHumanReply(id,'Fixture'),()=>handoffs.resolveHandoff(id)];
test('viewer, unknown role, revoked membership and anonymous sessions cannot invoke administrative actions',async()=>{
 for(const role of ['viewer','injected',null]){
  state.tenant=role===null?null:{tenantId:tenant,role};
  for(const action of actions){const r=await action();assert.equal(r.ok,false);assert.equal(state.calls.length,0);}
 }
 state.tenant={tenantId:tenant,role:'owner'};state.user={id:user,is_anonymous:true};
 for(const action of actions){assert.equal((await action()).ok,false);assert.equal(state.calls.length,0);}
});
test('operational members keep controlled reply rejection and handoff-taking through scoped server writes',async()=>{
 for(const role of ['owner','agent']){
  state.tenant.role=role;state.calls=[];
  assert.equal((await approval.rejectReply(id)).ok,true);
  const update=state.calls.find(c=>c.update);assert.equal(update.admin,true);assert.ok(update.filters.some(([k,v])=>k==='tenant_id'&&v===tenant));
  state.calls=[];assert.equal((await handoffs.takeHandoff(id)).ok,true);
  const handoff=state.calls.find(c=>c.update);assert.equal(handoff.admin,true);assert.ok(handoff.filters.some(([k,v])=>k==='tenant_id'&&v===tenant));assert.ok(handoff.filters.some(([k,v])=>k==='status'&&v==='open'));
 }
});
test('business-wide NEXO customization is owner-only while other roles make no writes',async()=>{
 for(const role of ['viewer','agent']){state.tenant.role=role;assert.equal((await jarvis.saveJarvisConfig({})).ok,false);assert.equal(state.calls.length,0);}
 state.tenant.role='owner';assert.equal((await jarvis.saveJarvisConfig({})).ok,true);assert.equal(state.calls.length,1);
});
