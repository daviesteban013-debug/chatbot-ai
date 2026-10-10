-- New businesses sell autonomously. Existing paused/testing choices are preserved.
alter table public.agents alter column mode set default 'autonomous';
alter type public.payment_method add value if not exists 'enlace';
-- Only server endpoints may write agent settings or create customer acceptance evidence.
revoke insert,update,delete on public.agents,public.messages from anon,authenticated;
grant select on public.agents,public.messages to authenticated;
create index if not exists orders_sales_conversation_idx on public.orders(tenant_id,conversation_id,customer_id,created_at desc);
create index if not exists order_items_sales_order_idx on public.order_items(tenant_id,order_id,id);
create index if not exists messages_sales_latest_idx on public.messages(tenant_id,conversation_id,created_at desc,id desc);

create or replace function public.nexo_configure_sales_payments(p_tenant uuid,p_user uuid,p_link text,p_transfer text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare a public.agents%rowtype; config jsonb;
begin
  perform 1 from public.tenant_members where tenant_id=p_tenant and user_id=p_user and role='owner' for share;
  if not found then raise exception 'SALE_OWNER_REQUIRED'; end if;
  if length(coalesce(p_link,''))>2048 or length(coalesce(p_transfer,''))>2000
    or (nullif(btrim(p_link),'') is not null and p_link !~ '^https://[A-Za-z0-9.-]+(:443)?([/?#][^[:space:]]*)?$')
    then raise exception 'SALE_INVALID_PAYMENT_SETTINGS'; end if;
  select * into a from public.agents where tenant_id=p_tenant and active=true order by created_at desc limit 1 for update;
  if not found then raise exception 'SALE_AGENT_REQUIRED'; end if;
  config:=jsonb_build_object('link_url',nullif(btrim(p_link),''),'transfer_instructions',nullif(btrim(p_transfer),''),'version',gen_random_uuid());
  update public.agents set business_rules=jsonb_set(case when jsonb_typeof(business_rules)='object' then business_rules
    else jsonb_build_object('reglas',business_rules) end,'{sales_payments}',config),updated_at=clock_timestamp() where id=a.id and tenant_id=p_tenant;
  return config;
end $$;

create or replace function public.nexo_create_whatsapp_order(p_tenant uuid,p_conversation uuid,p_customer uuid,p_items jsonb,
  p_order_type public.order_type,p_payment public.payment_method,p_shipping integer)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare o public.orders%rowtype; line record; v public.product_variants%rowtype; p public.products%rowtype;
  price integer; subtotal bigint:=0; resolved jsonb:='[]'::jsonb; current_mode public.agent_mode;
begin
  perform 1 from public.conversations where id=p_conversation and tenant_id=p_tenant and customer_id=p_customer and status='open' for update;
  if not found then raise exception 'SALE_CONVERSATION_UNAVAILABLE'; end if;
  select mode into current_mode from public.agents where tenant_id=p_tenant and active=true order by created_at desc limit 1 for share;
  if current_mode is distinct from 'autonomous'::public.agent_mode then raise exception 'SALE_NOT_AUTONOMOUS'; end if;
  if not exists(select 1 from public.agents where tenant_id=p_tenant and active=true and
    ((p_payment::text='enlace' and nullif(btrim(business_rules->'sales_payments'->>'link_url'),'') is not null)
    or (p_payment::text='transferencia' and nullif(btrim(business_rules->'sales_payments'->>'transfer_instructions'),'') is not null)))
    then raise exception 'SALE_PAYMENT_NOT_CONFIGURED'; end if;
  select * into o from public.orders where tenant_id=p_tenant and conversation_id=p_conversation and customer_id=p_customer and status='draft' limit 1;
  if found then return jsonb_build_object('order_id',o.id,'status','draft','existing',true); end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 10
    or p_shipping is null or p_shipping<0 or p_payment is null or p_order_type is null then raise exception 'SALE_INVALID_ITEMS'; end if;
  if exists(select 1 from jsonb_array_elements(p_items) i where jsonb_typeof(i->'variant_sku') is distinct from 'string'
    or nullif(btrim(i->>'variant_sku'),'') is null or (i->>'qty') !~ '^[1-9][0-9]{0,3}$' or i->>'qty' is null)
    then raise exception 'SALE_INVALID_ITEMS'; end if;
  for line in select i->>'variant_sku' as sku,sum((i->>'qty')::integer)::integer as qty
    from jsonb_array_elements(p_items) i group by i->>'variant_sku' order by i->>'variant_sku'
  loop
    select * into v from public.product_variants where tenant_id=p_tenant and sku=line.sku and active=true for update;
    if not found then raise exception 'SALE_PRODUCT_UNAVAILABLE'; end if;
    select * into p from public.products where id=v.product_id and tenant_id=p_tenant and active=true for share;
    if not found then raise exception 'SALE_PRODUCT_UNAVAILABLE'; end if;
    if v.stock_qty-v.reserved_qty<line.qty then raise exception 'SALE_STOCK_UNAVAILABLE'; end if;
    price:=coalesce(v.price_override,case when p_order_type='wholesale' and p.price_wholesale is not null
      and line.qty>=coalesce(p.wholesale_min_qty,1) then p.price_wholesale else p.price_retail end);
    if price is null or price<0 then raise exception 'SALE_INVALID_PRICE'; end if;
    subtotal:=subtotal+price::bigint*line.qty;
    resolved:=resolved||jsonb_build_array(jsonb_build_object('variant_id',v.id,'name',p.name||coalesce(' · '||v.color,'')||coalesce(' · '||v.size,''),'qty',line.qty,'unit_price',price));
    update public.product_variants set reserved_qty=reserved_qty+line.qty where id=v.id and tenant_id=p_tenant;
  end loop;
  insert into public.orders(tenant_id,conversation_id,customer_id,order_type,status,subtotal,discount,shipping_cost,total,payment_method,payment_status,created_by)
    values(p_tenant,p_conversation,p_customer,p_order_type,'draft',subtotal,0,p_shipping,subtotal+p_shipping,p_payment,'pending','agent') returning * into o;
  insert into public.order_items(tenant_id,order_id,variant_id,name_snapshot,qty,unit_price)
    select p_tenant,o.id,(i->>'variant_id')::uuid,i->>'name',(i->>'qty')::integer,(i->>'unit_price')::integer from jsonb_array_elements(resolved) i;
  return jsonb_build_object('order_id',o.id,'status','draft','items',resolved,'subtotal',subtotal,'shipping_cost',p_shipping,'total',subtotal+p_shipping,'payment_method',p_payment,'existing',false);
end $$;

create or replace function public.nexo_cancel_whatsapp_draft(p_tenant uuid,p_conversation uuid,p_customer uuid,p_order uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare o public.orders%rowtype; line record;
begin
  perform 1 from public.conversations where id=p_conversation and tenant_id=p_tenant and customer_id=p_customer and status='open' for update;
  if not found then raise exception 'SALE_CONVERSATION_UNAVAILABLE'; end if;
  select * into o from public.orders where tenant_id=p_tenant and conversation_id=p_conversation and customer_id=p_customer and id=p_order for update;
  if not found then raise exception 'SALE_NOT_FOUND'; end if;
  if o.status='canceled' then return jsonb_build_object('order_id',o.id,'status','canceled','already_canceled',true); end if;
  if o.status<>'draft' then raise exception 'SALE_ONLY_DRAFT_CAN_CANCEL'; end if;
  for line in select i.variant_id,sum(i.qty)::integer qty from public.order_items i
    join public.product_variants v on v.id=i.variant_id and v.tenant_id=p_tenant
    where i.tenant_id=p_tenant and i.order_id=o.id group by i.variant_id order by min(v.sku)
  loop
    update public.product_variants set reserved_qty=reserved_qty-line.qty where id=line.variant_id and tenant_id=p_tenant and reserved_qty>=line.qty;
    if not found then raise exception 'SALE_RESERVATION_MISMATCH'; end if;
  end loop;
  update public.orders set status='canceled',updated_at=clock_timestamp() where id=o.id and tenant_id=p_tenant;
  return jsonb_build_object('order_id',o.id,'status','canceled','already_canceled',false);
end $$;

-- A server-created snapshot binds customer acceptance to the exact terms sent.
create or replace function public.nexo_sales_snapshot(p_tenant uuid, p_conversation uuid, p_customer uuid, p_order uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare o public.orders%rowtype; lines jsonb; amount bigint; payments jsonb;
begin
  select * into o from public.orders
    where id=p_order and tenant_id=p_tenant and conversation_id=p_conversation and customer_id=p_customer;
  if not found or not exists(select 1 from public.conversations where id=p_conversation and tenant_id=p_tenant and customer_id=p_customer)
    then raise exception 'SALE_NOT_FOUND'; end if;
  select jsonb_agg(jsonb_build_object('id',id,'variant_id',variant_id,'name',name_snapshot,'qty',qty,'unit_price',unit_price) order by id),
    sum(qty::bigint*unit_price) into lines,amount
    from public.order_items where order_id=o.id and tenant_id=p_tenant;
  if lines is null or jsonb_array_length(lines)>10 or amount<>o.subtotal or o.total<>o.subtotal-o.discount+o.shipping_cost
    or o.total<0 or o.shipping_cost<0 or o.discount<0 or o.payment_method is null
    then raise exception 'SALE_INVALID_TOTAL'; end if;
  if nullif(btrim(o.recipient_name),'') is null or nullif(btrim(o.recipient_phone),'') is null
    or nullif(btrim(o.shipping_department),'') is null or nullif(btrim(o.shipping_city),'') is null
    or nullif(btrim(o.shipping_neighborhood),'') is null or nullif(btrim(o.shipping_address),'') is null
    then raise exception 'SALE_MISSING_SHIPPING'; end if;
  select business_rules->'sales_payments' into payments from public.agents where tenant_id=p_tenant and active=true order by created_at desc limit 1;
  if (o.payment_method::text='enlace' and nullif(btrim(payments->>'link_url'),'') is not null) then
    payments:=jsonb_build_object('link_url',payments->>'link_url','transfer_instructions',null,'version',payments->>'version');
  elsif (o.payment_method::text='transferencia' and nullif(btrim(payments->>'transfer_instructions'),'') is not null) then
    payments:=jsonb_build_object('link_url',null,'transfer_instructions',payments->>'transfer_instructions','version',payments->>'version');
  else raise exception 'SALE_PAYMENT_NOT_CONFIGURED'; end if;
  return jsonb_build_object('id',o.id,'subtotal',o.subtotal,'discount',o.discount,'shipping_cost',o.shipping_cost,'total',o.total,
    'payment_method',o.payment_method,'recipient_name',o.recipient_name,'recipient_phone',o.recipient_phone,
    'shipping_department',o.shipping_department,'shipping_city',o.shipping_city,'shipping_neighborhood',o.shipping_neighborhood,
    'shipping_address',o.shipping_address,'shipping_notes',o.shipping_notes,'items',lines,'payment_instructions',payments);
end $$;

create or replace function public.nexo_confirm_whatsapp_order(p_tenant uuid,p_conversation uuid,p_customer uuid,p_order uuid,p_trigger uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare o public.orders%rowtype; incoming public.messages%rowtype; summary public.messages%rowtype;
  snapshot jsonb; acceptance text; current_mode public.agent_mode;
begin
  -- Consistent lock order, no provider calls inside the transaction.
  perform 1 from public.conversations where id=p_conversation and tenant_id=p_tenant and customer_id=p_customer and status='open' for update;
  if not found then raise exception 'SALE_CONVERSATION_UNAVAILABLE'; end if;
  select mode into current_mode from public.agents where tenant_id=p_tenant and active=true order by created_at desc limit 1 for share;
  if current_mode is distinct from 'autonomous'::public.agent_mode then raise exception 'SALE_NOT_AUTONOMOUS'; end if;
  select * into o from public.orders where id=p_order and tenant_id=p_tenant and conversation_id=p_conversation and customer_id=p_customer for update;
  if not found then raise exception 'SALE_NOT_FOUND'; end if;
  if o.status='pending_payment' and exists(select 1 from public.messages where tenant_id=p_tenant and conversation_id=p_conversation
    and id=p_trigger and raw->>'nexo_confirmed_order'=p_order::text)
    then return jsonb_build_object('snapshot',(select raw->'nexo_accepted_snapshot' from public.messages where id=p_trigger and tenant_id=p_tenant),'already_confirmed',true); end if;
  if o.status<>'draft' then raise exception 'SALE_NOT_DRAFT'; end if;
  perform 1 from public.order_items where order_id=o.id and tenant_id=p_tenant order by id for share;
  snapshot:=public.nexo_sales_snapshot(p_tenant,p_conversation,p_customer,p_order);
  select * into incoming from public.messages where tenant_id=p_tenant and conversation_id=p_conversation
    and direction='inbound' and sender='customer' order by created_at desc,id desc limit 1 for update;
  if incoming.id is distinct from p_trigger then raise exception 'SALE_CONFIRMATION_NOT_CURRENT'; end if;
  acceptance:=coalesce(nullif(btrim(incoming.transcript),''),incoming.body,'');
  if acceptance ~ '[?¿]' then raise exception 'SALE_NEEDS_CUSTOMER_ACCEPTANCE'; end if;
  acceptance:=btrim(regexp_replace(translate(lower(acceptance),'áéíóúü','aeiouu'),'[^a-z0-9]+',' ','g'));
  if acceptance not in ('si','si confirmo','confirmo','acepto','si acepto','de acuerdo','dale','dale confirmado','confirmado',
    'correcto','perfecto','si esta correcto','todo correcto','si todo correcto','si esta bien','esta bien')
    then raise exception 'SALE_NEEDS_CUSTOMER_ACCEPTANCE'; end if;
  select * into summary from public.messages where tenant_id=p_tenant and conversation_id=p_conversation and direction='outbound'
    order by created_at desc,id desc limit 1 for share;
  if summary.id is null or summary.created_at>=incoming.created_at or summary.sender<>'agent'
    or summary.raw->>'nexo_sale' is distinct from 'order_summary' or summary.raw->>'order_id' is distinct from p_order::text
    or summary.raw->'snapshot' is distinct from snapshot or summary.created_at<now()-interval '24 hours'
    then raise exception 'SALE_SEND_CURRENT_SUMMARY_FIRST'; end if;
  update public.orders set status='pending_payment',updated_at=clock_timestamp() where id=o.id and tenant_id=p_tenant;
  update public.messages set raw=coalesce(raw,'{}'::jsonb)||jsonb_build_object('nexo_confirmed_order',o.id,'nexo_accepted_snapshot',snapshot)
    where id=incoming.id and tenant_id=p_tenant;
  return jsonb_build_object('snapshot',snapshot,'already_confirmed',false);
end $$;

revoke all on function public.nexo_sales_snapshot(uuid,uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.nexo_confirm_whatsapp_order(uuid,uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.nexo_sales_snapshot(uuid,uuid,uuid,uuid) to service_role;
grant execute on function public.nexo_confirm_whatsapp_order(uuid,uuid,uuid,uuid,uuid) to service_role;
revoke all on function public.nexo_create_whatsapp_order(uuid,uuid,uuid,jsonb,public.order_type,public.payment_method,integer) from public,anon,authenticated;
revoke all on function public.nexo_cancel_whatsapp_draft(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.nexo_create_whatsapp_order(uuid,uuid,uuid,jsonb,public.order_type,public.payment_method,integer) to service_role;
grant execute on function public.nexo_cancel_whatsapp_draft(uuid,uuid,uuid,uuid) to service_role;
revoke all on function public.nexo_configure_sales_payments(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.nexo_configure_sales_payments(uuid,uuid,text,text) to service_role;
