import assert from 'node:assert/strict';
import {beforeEach,test} from 'node:test';
import {load,moduleUrl} from '../agent/load.mjs';
const zod=import.meta.resolve('zod');
const policy=await load('../../lib/agent/sales-policy.ts');
const payments=await load('../../lib/sales-payments.ts',{zod});
const {orderSummaryReply,confirmedOrderReply}=await import(policy);
const tools=await import(await load('../../lib/agent/tools.ts',{
 zod,'./sales-policy':policy,'@/lib/sales-payments':payments,
 '@/lib/whatsapp/send':moduleUrl('export const sendImage=async()=>({});'),
 '@/lib/geo/colombia':moduleUrl('export const normalizeCity=(_,v)=>v;export const normalizeDepartment=v=>v;'),
}));
const tenant=crypto.randomUUID(),customer=crypto.randomUUID(),conversation=crypto.randomUUID(),order=crypto.randomUUID(),trigger=crypto.randomUUID();
const snapshot={id:order,total:208000,subtotal:200000,discount:0,shipping_cost:8000,payment_method:'enlace',recipient_name:'Ana',recipient_phone:'573001111111',shipping_department:'Bogotá D.C.',shipping_city:'Bogotá',shipping_neighborhood:'Centro',shipping_address:'Ficticia',shipping_notes:null,
 payment_instructions:{link_url:'https://pay.example/tenant-a',transfer_instructions:null,version:'v1'},items:[{id:crypto.randomUUID(),variant_id:crypto.randomUUID(),name:'Product',qty:1,unit_price:200000}]};
let state;
beforeEach(()=>{state={calls:[],rpcs:[],config:{mode:'autonomous',auto_confirm_max_total:1,business_rules:{sales_payments:{link_url:'https://pay.example/tenant-a',transfer_instructions:'Banco A'}}},order:{id:order},message:{body:'Quiero comprar'},snapshot,error:null};});
const db={from(table){const call={table,filters:[]};state.calls.push(call);const q={select(fields){call.fields=fields;return q},eq(...args){call.filters.push(args);return q},order(){return q},limit(){return q},
 maybeSingle:async()=>({data:table==='agents'?state.config:table==='messages'?state.message:state.order,error:state.error}),
 then(resolve){return Promise.resolve({data:table==='orders'?[state.order]:[],error:state.error}).then(resolve)}};return q},
 rpc:async(name,args)=>{state.rpcs.push({name,args});return {data:name==='nexo_sales_snapshot'?state.snapshot:{snapshot:state.snapshot,already_confirmed:false},error:state.error}}};
const context=()=>({supabase:db,tenantId:tenant,customerId:customer,conversationId:conversation,triggerMessageId:trigger,mode:'autonomous',simulate:false});
const run=(name,args={},ctx=context())=>tools.executeToolCall(name,args,ctx);

test('payment options and order state are scoped to the server business/conversation',async()=>{
 const options=await run('get_payment_options');assert.deepEqual(options.data.available_methods,['enlace','transferencia']);assert.equal(options.data.automatic_payment_verification,false);
 assert.ok(state.calls[0].filters.some(([k,v])=>k==='tenant_id'&&v===tenant));
 await run('get_sale_state');const q=state.calls.at(-1);for(const [k,v]of[['tenant_id',tenant],['customer_id',customer],['conversation_id',conversation]])assert.ok(q.filters.some(([a,b])=>a===k&&b===v));
});
test('server summary ends the turn and carries the exact database snapshot',async()=>{
 const ctx=context();const r=await run('prepare_order_confirmation',{order_id:order},ctx);assert.equal(r.ok,true);assert.equal(r.data.requires_advisor,false);
 assert.deepEqual(ctx.salesReply.raw.snapshot,snapshot);assert.match(ctx.salesReply.text,/208\.000/);assert.match(ctx.salesReply.text,/¿Confirmas/);
 assert.equal(state.rpcs[0].args.p_customer,customer);
 assert.equal((await run('prepare_order_confirmation',{order_id:order,tenant_id:'forged'})).ok,false);
});
test('confirmation ignores model claims and passes the current stored inbound message to the transaction',async()=>{
 const ctx=context();const r=await run('confirm_order',{order_id:order,customer_confirmed:true,customer_confirmation_quote:'invented by model'},ctx);
 assert.equal(r.ok,true);assert.equal(state.rpcs[0].name,'nexo_confirm_whatsapp_order');assert.equal(state.rpcs[0].args.p_trigger,trigger);
 assert.equal('customer_confirmation_quote' in state.rpcs[0].args,false);assert.equal(r.data.payment_status,'pending');assert.match(ctx.salesReply.text,/https:\/\/pay\.example\/tenant-a/);
 state.error={message:'private SQL details'};const denied=await run('confirm_order',{order_id:order,customer_confirmed:true,customer_confirmation_quote:'sí'});assert.equal(denied.ok,false);assert.doesNotMatch(denied.error,/private SQL/);
});
test('normal sales objections and high values cannot create an unsolicited handoff',async()=>{
 for(const reason of ['incertidumbre','pedido_alto_valor','reclamo','negociacion'])assert.equal((await run('escalate_to_human',{reason,summary:'Fixture'})).ok,false);
 assert.equal((await run('escalate_to_human',{reason:'solicitud_cliente',summary:'Fake customer request'})).ok,false);
 state.message.body='No quiero hablar con un asesor';assert.equal((await run('escalate_to_human',{reason:'solicitud_cliente',summary:'Fake'})).ok,false);
 assert.equal(state.rpcs.length,0);
});
test('canonical receipts use the selected business destination and never claim payment or shipment completed',()=>{
 const transfer={...snapshot,payment_method:'transferencia',payment_instructions:{link_url:null,transfer_instructions:'Banco de prueba',version:'v2'}};
 const reply=confirmedOrderReply(transfer);assert.match(reply.text,/Banco de prueba/);assert.match(reply.text,/pago y el despacho siguen pendientes/);assert.doesNotMatch(reply.text,/pay\.example/);
 assert.deepEqual(orderSummaryReply(transfer).raw.snapshot,transfer);
});

const actionState={};
globalThis.__salesUser=async()=>actionState.user;
globalThis.__salesTenant=async()=>actionState.tenant;
globalThis.__salesRpc=async(name,args)=>{actionState.calls.push({name,args});return {error:actionState.error}};
const {saveSalesPayments}=await import(await load('../../app/dashboard/agent/actions.ts',{
 'next/cache':moduleUrl('export const revalidatePath=()=>{};'),
 '@/lib/auth':moduleUrl('export const getCurrentUser=()=>globalThis.__salesUser();export const getCurrentTenant=()=>globalThis.__salesTenant();'),
 '@/lib/supabase/admin':moduleUrl('export const createAdminClient=()=>({rpc:(...args)=>globalThis.__salesRpc(...args)});'),
 '@/lib/sales-payments':payments,
}));
test('payment settings derive owner and business on the server and reject secret-bearing URLs or forged scope',async()=>{
 Object.assign(actionState,{user:{id:customer},tenant:{tenantId:tenant,role:'owner'},calls:[],error:null});
 for(const input of [{linkUrl:'http://pay.example',transferInstructions:''},{linkUrl:'https://user:secret@pay.example',transferInstructions:''},{linkUrl:'',transferInstructions:'Cuenta',tenant_id:'other'}])assert.equal((await saveSalesPayments(input)).ok,false);
 assert.equal((await saveSalesPayments({linkUrl:'https://pay.example',transferInstructions:'Banco A'})).ok,true);assert.equal(actionState.calls[0].args.p_tenant,tenant);assert.equal(actionState.calls[0].args.p_user,customer);
 actionState.tenant.role='viewer';assert.equal((await saveSalesPayments({linkUrl:'',transferInstructions:'Banco A'})).ok,false);
 actionState.tenant.role='owner';actionState.user.is_anonymous=true;assert.equal((await saveSalesPayments({linkUrl:'',transferInstructions:'Banco A'})).ok,false);
});
