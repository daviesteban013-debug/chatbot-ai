-- Proposals never reserve stock or create orders. Only a deliberate UI decision
-- can call the separate service-only transaction. No model has that tool.
create table public.nexo_order_proposals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id text not null references public.jarvis_sessions(session_id) on delete cascade,
  request_key text not null,
  status text not null default 'pending' check (status in ('pending','confirmed','canceled','expired','handed_off')),
  snapshot jsonb not null,
  order_id uuid references public.orders(id),
  handoff_id uuid references public.handoffs(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '15 minutes',
  decided_at timestamptz
);
create unique index nexo_pending_request on public.nexo_order_proposals(session_id,user_id,request_key) where status='pending';
create index nexo_proposal_session on public.nexo_order_proposals(user_id,session_id,created_at desc);
create index nexo_proposal_tenant on public.nexo_order_proposals(tenant_id);
create index nexo_proposal_order on public.nexo_order_proposals(order_id);
create index nexo_proposal_handoff on public.nexo_order_proposals(handoff_id);
alter table public.nexo_order_proposals enable row level security;
revoke all on public.nexo_order_proposals from public,anon,authenticated;
grant select on public.nexo_order_proposals to authenticated;
grant all on public.nexo_order_proposals to service_role;
create policy nexo_proposal_owner_read on public.nexo_order_proposals for select to authenticated
using (user_id=(select auth.uid()) and exists (select 1 from public.tenant_members m where m.tenant_id=nexo_order_proposals.tenant_id and m.user_id=(select auth.uid()) and m.role in ('owner','agent')));

create function public.nexo_prepare_order(p_tenant uuid,p_user uuid,p_session text,p_customer uuid,p_items jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  c public.customers%rowtype; v record; item jsonb; lines jsonb='[]'; proposal public.nexo_order_proposals%rowtype;
  quantity integer; unit_price integer; subtotal bigint=0; fingerprint text; canonical jsonb;
begin
  perform 1 from public.tenant_members where tenant_id=p_tenant and user_id=p_user and role in ('owner','agent') for share;
  if not found then raise exception 'NEXO_FORBIDDEN'; end if;
  perform 1 from public.jarvis_sessions where session_id=p_session and tenant_id=p_tenant and user_id=p_user for share;
  if not found then raise exception 'NEXO_FORBIDDEN'; end if;
  select * into c from public.customers where id=p_customer and tenant_id=p_tenant;
  if not found then raise exception 'NEXO_CUSTOMER'; end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 10 then raise exception 'NEXO_ITEMS'; end if;
  for item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(item)<>'object' or jsonb_typeof(item->'variant_sku')<>'string' or length(item->>'variant_sku') not between 1 and 100
      or coalesce(item->>'qty','') !~ '^[1-9][0-9]{0,3}$' or (item->>'qty')::int > 1000 then raise exception 'NEXO_ITEMS'; end if;
  end loop;
  if (select count(distinct value->>'variant_sku') from jsonb_array_elements(p_items))<>jsonb_array_length(p_items) then raise exception 'NEXO_ITEMS'; end if;
  select jsonb_agg(value order by value->>'variant_sku') into canonical from jsonb_array_elements(p_items);
  fingerprint=md5(p_customer::text||canonical::text);
  perform pg_advisory_xact_lock(hashtextextended(p_session||p_user::text,0));
  update public.nexo_order_proposals set status='expired',decided_at=now() where session_id=p_session and user_id=p_user and status='pending' and expires_at<=now();
  select * into proposal from public.nexo_order_proposals where session_id=p_session and user_id=p_user and request_key=fingerprint and status='pending';
  if found then return jsonb_build_object('ok',true,'proposal',to_jsonb(proposal)); end if;
  if (select count(*) from public.nexo_order_proposals where session_id=p_session and user_id=p_user and status='pending')>=20 then raise exception 'NEXO_LIMIT'; end if;
  for item in select value from jsonb_array_elements(canonical) loop
    quantity=(item->>'qty')::int;
    select pv.*,p.name, p.price_retail into v from public.product_variants pv join public.products p on p.id=pv.product_id and p.tenant_id=p_tenant
      where pv.tenant_id=p_tenant and pv.sku=item->>'variant_sku' and pv.active and p.active;
    if not found then raise exception 'NEXO_PRODUCT'; end if;
    if v.stock_qty-v.reserved_qty<quantity then raise exception 'NEXO_STOCK'; end if;
    unit_price=coalesce(v.price_override,v.price_retail);
    if unit_price is null or unit_price<0 then raise exception 'NEXO_PRICE'; end if;
    subtotal=subtotal+unit_price::bigint*quantity;
    if subtotal>2000000000 then raise exception 'NEXO_LIMIT'; end if;
    lines=lines||jsonb_build_array(jsonb_build_object('variant_id',v.id,'sku',v.sku,'name',concat_ws(' · ',v.name,v.color,v.size),'qty',quantity,'unit_price',unit_price));
  end loop;
  insert into public.nexo_order_proposals(tenant_id,user_id,session_id,request_key,snapshot)
    values(p_tenant,p_user,p_session,fingerprint,jsonb_build_object('customer_id',c.id,'customer_name',coalesce(c.name,'Cliente sin nombre'),'items',lines,'subtotal',subtotal,'total',subtotal,'currency','COP','fulfillment','unassigned')) returning * into proposal;
  return jsonb_build_object('ok',true,'proposal',to_jsonb(proposal));
end $$;
revoke all on function public.nexo_prepare_order(uuid,uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.nexo_prepare_order(uuid,uuid,text,uuid,jsonb) to service_role;

create function public.nexo_decide_order(p_id uuid,p_user uuid,p_decision text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  proposal public.nexo_order_proposals%rowtype; item jsonb; v record; line jsonb;
  conversation uuid; handoff uuid; created_order uuid; summary text;
begin
  if p_decision is null or p_decision not in ('confirm','cancel','handoff') then raise exception 'NEXO_DECISION'; end if;
  select * into proposal from public.nexo_order_proposals where id=p_id and user_id=p_user for update;
  if not found then raise exception 'NEXO_FORBIDDEN'; end if;
  perform 1 from public.tenant_members where tenant_id=proposal.tenant_id and user_id=p_user and role in ('owner','agent') for share;
  if not found then raise exception 'NEXO_FORBIDDEN'; end if;
  perform 1 from public.jarvis_sessions where session_id=proposal.session_id and tenant_id=proposal.tenant_id and user_id=p_user for share;
  if not found then raise exception 'NEXO_FORBIDDEN'; end if;
  -- Row locking makes concurrent clicks/retries return the same completed result.
  if proposal.status<>'pending' then return jsonb_build_object('ok',true,'proposal',to_jsonb(proposal)); end if;
  if p_decision='cancel' then
    update public.nexo_order_proposals set status='canceled',decided_at=now() where id=p_id returning * into proposal;
  elsif proposal.expires_at<=now() then
    update public.nexo_order_proposals set status='expired',decided_at=now() where id=p_id returning * into proposal;
  elsif p_decision='handoff' then
    -- A CRM handoff is explicit and assigned to the person who requested it.
    select id into conversation from public.conversations where tenant_id=proposal.tenant_id and customer_id=(proposal.snapshot->>'customer_id')::uuid and status in ('open','handoff') order by created_at desc,id limit 1 for update;
    if conversation is null then
      insert into public.conversations(tenant_id,customer_id,status,assigned_to) values(proposal.tenant_id,(proposal.snapshot->>'customer_id')::uuid,'handoff',p_user) returning id into conversation;
    else
      update public.conversations set status='handoff',assigned_to=p_user where id=conversation and tenant_id=proposal.tenant_id;
    end if;
    summary='Propuesta NEXO para '||(proposal.snapshot->>'customer_name')||'. Total orientativo: '||(proposal.snapshot->>'total')||' COP. Sin envío asignado. No se creó pedido ni se reservó stock.';
    for item in select value from jsonb_array_elements(proposal.snapshot->'items') loop
      summary=summary||E'\n'||(item->>'qty')||' × '||(item->>'name')||' ['||(item->>'sku')||'] a '||(item->>'unit_price')||' COP';
    end loop;
    insert into public.handoffs(tenant_id,conversation_id,reason,summary,priority,status,taken_by) values(proposal.tenant_id,conversation,'solicitud_cliente',summary,'normal','taken',p_user) returning id into handoff;
    update public.nexo_order_proposals set status='handed_off',handoff_id=handoff,decided_at=now() where id=p_id returning * into proposal;
  else
    -- Lock all variants and their product prices in a stable order BEFORE writing.
    for item in select value from jsonb_array_elements(proposal.snapshot->'items') order by value->>'variant_id' loop
      select pv.*,p.price_retail,p.active as product_active into v from public.product_variants pv join public.products p on p.id=pv.product_id and p.tenant_id=proposal.tenant_id
        where pv.id=(item->>'variant_id')::uuid and pv.tenant_id=proposal.tenant_id for update of pv for share of p;
      if not found or not v.active or not v.product_active then return jsonb_build_object('ok',false,'code','product_changed'); end if;
      if coalesce(v.price_override,v.price_retail)<>(item->>'unit_price')::int then return jsonb_build_object('ok',false,'code','price_changed'); end if;
      if v.stock_qty-v.reserved_qty<(item->>'qty')::int then return jsonb_build_object('ok',false,'code','stock_changed'); end if;
    end loop;
    perform 1 from public.customers where id=(proposal.snapshot->>'customer_id')::uuid and tenant_id=proposal.tenant_id for share;
    if not found then return jsonb_build_object('ok',false,'code','customer_changed'); end if;
    insert into public.orders(tenant_id,customer_id,order_type,status,subtotal,total,created_by,payment_status)
      values(proposal.tenant_id,(proposal.snapshot->>'customer_id')::uuid,'retail','draft',(proposal.snapshot->>'subtotal')::int,(proposal.snapshot->>'total')::int,'human','pending') returning id into created_order;
    for line in select value from jsonb_array_elements(proposal.snapshot->'items') loop
      update public.product_variants set reserved_qty=reserved_qty+(line->>'qty')::int where id=(line->>'variant_id')::uuid and tenant_id=proposal.tenant_id;
      insert into public.order_items(tenant_id,order_id,variant_id,name_snapshot,qty,unit_price)
        values(proposal.tenant_id,created_order,(line->>'variant_id')::uuid,line->>'name',(line->>'qty')::int,(line->>'unit_price')::int);
    end loop;
    update public.nexo_order_proposals set status='confirmed',order_id=created_order,decided_at=now() where id=p_id returning * into proposal;
  end if;
  return jsonb_build_object('ok',true,'proposal',to_jsonb(proposal));
end $$;
revoke all on function public.nexo_decide_order(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.nexo_decide_order(uuid,uuid,text) to service_role;
