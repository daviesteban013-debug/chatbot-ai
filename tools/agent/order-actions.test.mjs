import assert from 'node:assert/strict';
import {beforeEach,test} from 'node:test';
import {load,moduleUrl} from './load.mjs';
const shared=await load('../../lib/order-proposals.ts',{zod:import.meta.resolve('zod')});
const {createOrderPreparation}=await import(await load('../../lib/agent/order-actions.ts',{'@/lib/order-proposals':shared,zod:import.meta.resolve('zod')}));
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
 assert.deepEqual(action.tools.map(t=>t.function.name),['prepare_order_proposal','prepare_repeat_order_proposal']);const result=await action.execute({customer_id:customer,items:[{variant_sku:'SKU-1',qty:1}]});assert.equal(result.ok,true);assert.equal(result.data.order_created,false);assert.equal(result.data.stock_reserved,false);assert.equal(action.proposals[0].id,id);assert.equal(state.calls[0].args.p_user,uid);assert.equal(state.calls[0].args.p_tenant,tenant);
});
test('viewer/missing membership, invented price/identity and duplicate SKU arguments never invoke preparation',async()=>{
 for(const role of ['viewer',null]) {const a=createOrderPreparation({supabase:__proposalAdmin(),tenantId:tenant,userId:uid,sessionId:'session-fixture',role});assert.equal(a.tools.length,0);assert.equal((await a.execute({})).ok,false);assert.equal((await a.executeRepeat({customer_id:customer})).ok,false);}
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

function repeatFixture() {
 const sourceOrder=crypto.randomUUID(),variant=crypto.randomUUID(),otherVariant=crypto.randomUUID();
 const fixture={queries:[],rpcs:[],orders:[{id:sourceOrder,tenant_id:tenant,customer_id:customer,order_type:'retail',created_at:'2026-10-09'}],
  order_items:[{id:'line-1',tenant_id:tenant,order_id:sourceOrder,variant_id:variant,qty:2}],
  product_variants:[{id:variant,tenant_id:tenant,sku:'CURRENT-SKU',active:true,stock_qty:10,reserved_qty:1,price_override:null,products:{tenant_id:tenant,active:true,price_retail:30000}}],
  sourceOrder,variant,otherVariant,missingCount:false,stale:false,rpcError:null};
 const database={from(table){const entry={table,filters:[],orders:[]};fixture.queries.push(entry);const q={
  select(columns,options){Object.assign(entry,{columns,options});return q;},eq(key,value){entry.filters.push([key,value]);return q;},
  in(key,value){entry.filters.push([key,value]);return q;},order(key,options={}){entry.orders.push([key,options.ascending!==false]);return q;},limit(value){entry.limit=value;return q;},abortSignal(signal){signal.throwIfAborted();return q;},
  maybeSingle:async()=>{const value=read();return {...value,data:value.data[0]??null};},then(resolve,reject){return Promise.resolve(read()).then(resolve,reject);},
 };function read(){let rows=fixture[table].filter(row=>entry.filters.every(([key,value])=>{const field=key.split('.').reduce((obj,k)=>obj?.[k],row);return Array.isArray(value)?value.includes(field):field===value;}));
  rows.sort((a,b)=>{for(const[key,ascending]of entry.orders){const c=String(a[key]??'').localeCompare(String(b[key]??''));if(c)return ascending?c:-c;}return 0;});
  return{data:rows.slice(0,entry.limit),count:fixture.missingCount?null:rows.length,error:null};}return q;},
  rpc(name,args){fixture.rpcs.push({name,args});if(fixture.rpcError)throw new Error(fixture.rpcError);const current=fixture.product_variants[0];
   const items=args.p_items.map(item=>({variant_id:current.id,sku:item.variant_sku,name:'Producto actual',qty:fixture.responseQty??item.qty,unit_price:fixture.stale?12000:current.price_override??current.products.price_retail}));
   const subtotal=items.reduce((sum,item)=>sum+item.qty*item.unit_price,0);
   const snapshot={...proposal.snapshot,customer_id:fixture.responseCustomer??args.p_customer,subtotal,total:fixture.responseTotal??subtotal,items};
   const result=Promise.resolve({data:{ok:true,proposal:{...proposal,session_id:fixture.responseSession??'repeat-fixture',snapshot}},error:null});result.abortSignal=()=>result;return result;}
 };
 fixture.action=createOrderPreparation({supabase:database,tenantId:tenant,userId:uid,sessionId:'repeat-fixture',role:'owner'});
 return fixture;
}

test('repeat uses exact current variant SKUs and prices, aggregates quantities, and only calls proposal preparation',async()=>{
 const f=repeatFixture();f.order_items.push({...f.order_items[0],id:'line-2',qty:3});
 // Historical totals and prices are intentionally different and never enter the RPC.
 f.orders[0].total=1;f.order_items[0].unit_price=1;
 const result=await f.action.executeRepeat({customer_id:customer,order_id:f.sourceOrder});
 assert.equal(result.ok,true);assert.equal(result.data.current_prices_and_stock_verified,true);assert.equal(result.data.historical_terms_copied,false);
 assert.equal(result.data.order_created,false);assert.equal(result.data.stock_reserved,false);
 assert.equal(result.data.proposal.snapshot.items[0].unit_price,30000);
 assert.deepEqual(f.rpcs.map(call=>call.name),['nexo_prepare_order']);assert.deepEqual(f.rpcs[0].args.p_items,[{variant_sku:'CURRENT-SKU',qty:5}]);
 assert.ok(f.queries.every(query=>query.filters.some(([key,value])=>key==='tenant_id'&&value===tenant)));
 assert.ok(f.queries.find(query=>query.table==='product_variants').filters.some(([key,value])=>key==='products.tenant_id'&&value===tenant));
 assert.equal(f.action.proposals.length,1);
});

test('repeat respects current per-variant price overrides, including a legitimate zero price',async()=>{
 const f=repeatFixture();f.product_variants[0].price_override=0;
 const result=await f.action.executeRepeat({customer_id:customer});assert.equal(result.ok,true);
 assert.equal(result.data.proposal.snapshot.items[0].unit_price,0);assert.equal(result.data.proposal.snapshot.total,0);
});

test('repeat requires the exact customer and tenant and selects latest order only when no order ID is supplied',async()=>{
 const f=repeatFixture();const foreignOrder=crypto.randomUUID();
 f.orders.push({...f.orders[0],id:foreignOrder,tenant_id:crypto.randomUUID(),created_at:'2026-10-10'});
 assert.equal((await f.action.executeRepeat({customer_id:customer,order_id:foreignOrder})).ok,false);
 assert.equal((await f.action.executeRepeat({customer_id:crypto.randomUUID(),order_id:f.sourceOrder})).ok,false);
 assert.equal(f.rpcs.length,0);assert.equal(f.queries.every(query=>query.table==='orders'),true);
 const latest=await f.action.executeRepeat({customer_id:customer});assert.equal(latest.ok,true);assert.equal(latest.data.source_order.id,f.sourceOrder);
 assert.equal((await f.action.executeRepeat({customer_id:customer,tenant_id:crypto.randomUUID()})).ok,false);
});

test('repeat fails closed for wholesale, incomplete/excessive lines, invalid quantities, unavailable products or stock',async()=>{
 const mutations=[
  f=>{f.orders[0].order_type='wholesale';},
  f=>{f.missingCount=true;},
  f=>{f.order_items=[];},
  f=>{f.order_items=Array.from({length:11},(_,i)=>({...f.order_items[0],id:String(i)}));},
  f=>{f.order_items[0].qty=-1;f.order_items.push({...f.order_items[0],id:'line-2',qty:2});},
  f=>{f.order_items[0].qty=1000;f.order_items.push({...f.order_items[0],id:'line-2',qty:1});},
  f=>{f.product_variants[0].active=false;},
  f=>{f.product_variants[0].products.active=false;},
  f=>{f.product_variants[0].products.tenant_id=crypto.randomUUID();},
  f=>{f.product_variants[0].id=f.otherVariant;},
  f=>{f.product_variants[0].stock_qty=2;f.product_variants[0].reserved_qty=1;},
  f=>{f.product_variants[0].products.price_retail=null;},
 ];
 for(const mutate of mutations){const f=repeatFixture();mutate(f);assert.equal((await f.action.executeRepeat({customer_id:customer})).ok,false);assert.equal(f.rpcs.length,0);assert.equal(f.action.proposals.length,0);}
});

test('a deduplicated old pending snapshot is never presented as verified current prices',async()=>{
 const f=repeatFixture();f.stale=true;
 const result=await f.action.executeRepeat({customer_id:customer});
 assert.equal(result.ok,false);assert.match(result.error,/propuesta pendiente/);assert.equal(f.action.proposals.length,0);
 assert.deepEqual(f.rpcs.map(call=>call.name),['nexo_prepare_order']);
});

test('proposal responses must match server session/customer and transport errors remain private',async()=>{
 for(const change of [f=>{f.responseSession='other-session';},f=>{f.responseCustomer=crypto.randomUUID();},f=>{f.responseQty=999;},f=>{f.responseTotal=1;},f=>{f.rpcError='private database credentials';}]){
  const f=repeatFixture();change(f);const result=await f.action.executeRepeat({customer_id:customer});assert.equal(result.ok,false);assert.doesNotMatch(result.error,/private database/);assert.equal(f.action.proposals.length,0);
 }
 const f=repeatFixture();const controller=new AbortController();controller.abort();
 const a=createOrderPreparation({supabase:{},tenantId:tenant,userId:uid,sessionId:'repeat-fixture',role:'owner',signal:controller.signal});
 await assert.rejects(a.executeRepeat({customer_id:customer}),{name:'AbortError'});assert.equal(f.rpcs.length,0);
});
