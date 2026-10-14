import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { load, moduleUrl } from '../agent/load.mjs';

// Concurrency fixes: each decision is claimed in the database before any side effect.
const user = crypto.randomUUID(), tenant = crypto.randomUUID(), id = crypto.randomUUID();
let state;
beforeEach(() => { state = { calls: [], sends: [], rpcs: [], claimable: true, sendFails: false, rpcResult: { ok: true } }; });
globalThis.__raceDb = () => ({
  rpc: async (name, args) => { state.rpcs.push({ name, args }); return { data: state.rpcResult, error: null }; },
  from(table) {
    const call = { table, filters: [] }; state.calls.push(call);
    const q = {
      select(columns) { call.select = columns; return q; }, eq(...args) { call.filters.push(args); return q; }, order() { return q; }, limit() { return q; },
      update(payload) { call.update = payload; return q; }, insert(row) { call.insert = row; return q; },
      maybeSingle: async () => {
        if (call.update) return { data: state.claimable ? { id } : null, error: null };
        if (table === 'agent_runs') return { data: { id, status: 'proposed', proposed_reply: 'Hola', conversation_id: id, tenant_id: tenant }, error: null };
        if (table === 'conversations') return { data: { id, customer_id: id, customers: { id, phone: '+573000000000', name: 'C' } }, error: null };
        if (table === 'messages') return { data: { created_at: new Date().toISOString() }, error: null };
        if (table === 'handoffs') return { data: { id, status: 'open', taken_by: null }, error: null };
        return { data: null, error: null };
      },
      then(resolve) { return Promise.resolve({ error: null }).then(resolve); },
    };
    return q;
  },
});
const db = moduleUrl('export const createClient=async()=>globalThis.__raceDb(); export const createAdminClient=()=>globalThis.__raceDb();');
const common = {
  'next/cache': moduleUrl('export const revalidatePath=()=>{};'),
  '@/lib/auth': moduleUrl(`export const getCurrentUser=async()=>({id:${JSON.stringify(user)}});export const getCurrentTenant=async()=>({tenantId:${JSON.stringify(tenant)},role:'agent'});`),
  '@/lib/supabase/server': db, '@/lib/supabase/admin': db,
  '@/lib/whatsapp/credentials': moduleUrl('export const loadWhatsAppSendOptions=async()=>({phoneNumberId:"1",accessToken:"t"});'),
  '@/lib/whatsapp/send': moduleUrl('export const sendText=async(to,text)=>{const s=globalThis.__raceState();s.sends.push(text);if(s.sendFails)throw new Error("rechazado");return {messages:[{id:"wamid.1"}]};};export const isWithinServiceWindow=()=>true;'),
};
globalThis.__raceState = () => state;
const approval = await import(await load('../../app/dashboard/approval/actions.ts', common));
const handoffs = await import(await load('../../app/dashboard/handoffs/actions.ts', common));
const claims = () => state.calls.filter(c => c.table === 'agent_runs' && c.update);

test('an approved reply is claimed before sending, so a second click never sends it again', async () => {
  assert.equal((await approval.approveReply(id)).ok, true);
  assert.deepEqual(state.sends, ['Hola']);
  const [claim] = claims();
  assert.equal(claim.update.status, 'approved');
  assert.ok(claim.filters.some(([k, v]) => k === 'status' && v === 'proposed'));
  assert.equal(state.calls.find(c => c.table === 'messages' && c.insert).insert.wa_message_id, 'wamid.1');
  state.calls = []; state.sends = []; state.claimable = false;
  const second = await approval.approveReply(id);
  assert.equal(second.ok, false); assert.match(second.error, /ya fue procesada/);
  assert.deepEqual(state.sends, []);
});

test('if WhatsApp rejects the message the reply goes back to proposed for a retry', async () => {
  state.sendFails = true;
  const result = await approval.editAndApproveReply(id, 'Texto editado');
  assert.equal(result.ok, false);
  const [claim, revert] = claims();
  assert.equal(claim.update.status, 'edited');
  assert.deepEqual(revert.update, { status: 'proposed', final_reply: null });
  assert.ok(revert.filters.some(([k, v]) => k === 'status' && v === 'edited'));
  assert.equal((await approval.editAndApproveReply(id, 'x'.repeat(4097))).ok, false);
});

test('rejecting a reply twice reports that it was already processed', async () => {
  state.claimable = false;
  assert.equal((await approval.rejectReply(id)).ok, false);
});

test('orders are approved or rejected through one locked database decision', async () => {
  assert.equal((await approval.rejectOrder(id)).ok, true);
  assert.deepEqual(state.rpcs[0], { name: 'nexo_review_pending_order', args: { p_tenant: tenant, p_user: user, p_order: id, p_approve: false } });
  assert.equal(state.calls.length, 0, 'no separate stock release or status update from the server');
  state.rpcResult = { ok: false, reason: 'processed' };
  const again = await approval.approveOrder(id);
  assert.equal(again.ok, false); assert.match(again.error, /ya fue procesado/);
});

test('taking a handoff another advisor already took is reported instead of a false success', async () => {
  state.claimable = false;
  const result = await handoffs.takeHandoff(id);
  assert.equal(result.ok, false); assert.match(result.error, /Otro asesor/);
});
