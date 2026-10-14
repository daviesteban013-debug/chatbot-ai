begin;
-- NEXO as a manager: a daily briefing, sales questions and catalog changes prepared
-- by chat that only apply after a deliberate click (same model as order proposals).

-- ---------- Sales for a named period (NEXO tool; the executor already verified membership) ----------
create function public.nexo_sales_period(p_tenant uuid, p_period text)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare v_today timestamptz := date_trunc('day', now() at time zone 'America/Bogota') at time zone 'America/Bogota';
  v_from timestamptz; v_to timestamptz := now();
begin
  case p_period
    when 'today' then v_from := v_today;
    when 'yesterday' then v_from := v_today - interval '1 day'; v_to := v_today;
    when '7' then v_from := v_today - interval '6 days';
    when '30' then v_from := v_today - interval '29 days';
    when '90' then v_from := v_today - interval '89 days';
    else raise exception 'metrics_invalid';
  end case;
  return jsonb_build_object('period', p_period, 'from', v_from, 'to', v_to, 'timezone', 'America/Bogota',
    'current', public.nexo_sales_window(p_tenant, v_from, v_to),
    -- Same length immediately before (today so far vs yesterday at the same hour).
    'previous', public.nexo_sales_window(p_tenant, v_from - (v_to - v_from), v_from),
    'topProducts', (select coalesce(jsonb_agg(t order by t.qty desc, t.sales desc), '[]'::jsonb) from (
      select i.name_snapshot as name, sum(i.qty)::integer as qty, sum(i.qty * i.unit_price)::bigint as sales
      from public.order_items i join public.orders o on o.id=i.order_id
      where o.tenant_id=p_tenant and o.created_at >= v_from and o.created_at < v_to
        and o.status::text in ('pending_payment','confirmed','shipped','delivered')
      group by i.name_snapshot order by 2 desc, 3 desc limit 5) t));
end; $$;

-- ---------- Daily briefing: facts only, no model involved ----------
create function public.nexo_daily_briefing(p_tenant uuid, p_user uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare v_today timestamptz := date_trunc('day', now() at time zone 'America/Bogota') at time zone 'America/Bogota';
begin
  if not exists(select 1 from public.tenant_members where tenant_id=p_tenant and user_id=p_user) then raise exception 'briefing_forbidden'; end if;
  return jsonb_build_object(
    'date', to_char(now() at time zone 'America/Bogota', 'YYYY-MM-DD'),
    'today', public.nexo_sales_window(p_tenant, v_today, now()),
    'yesterday', public.nexo_sales_window(p_tenant, v_today - interval '1 day', v_today),
    'dayBefore', public.nexo_sales_window(p_tenant, v_today - interval '2 days', v_today - interval '1 day'),
    'unpaid', (select jsonb_build_object('count', count(*), 'total', coalesce(sum(total),0), 'oldest', min(created_at))
      from public.orders where tenant_id=p_tenant and status='pending_payment' and payment_status<>'paid'),
    'pendingApproval', (select count(*) from public.orders where tenant_id=p_tenant and status='pending_approval'),
    'handoffs', (select jsonb_build_object('count', count(*), 'oldest', min(h.created_at),
        'customer', (select coalesce(nullif(c.name,''), c.phone) from public.handoffs h2
          join public.conversations cv on cv.id=h2.conversation_id join public.customers c on c.id=cv.customer_id
          where h2.tenant_id=p_tenant and h2.status='open' order by h2.created_at limit 1))
      from public.handoffs h where h.tenant_id=p_tenant and h.status='open'),
    'lowStock', (select jsonb_build_object('count', count(*), 'outOfStock', count(*) filter (where s.available <= 0),
        'items', coalesce((select jsonb_agg(x) from (select name, sku, available from (
            select concat_ws(' · ', p.name, v.color, v.size) as name, v.sku, v.stock_qty - v.reserved_qty as available
            from public.product_variants v join public.products p on p.id=v.product_id
            where v.tenant_id=p_tenant and v.active and p.active and v.stock_qty - v.reserved_qty <= 2) y
          order by available, name limit 5) x), '[]'::jsonb))
      from (select v.stock_qty - v.reserved_qty as available from public.product_variants v join public.products p on p.id=v.product_id
        where v.tenant_id=p_tenant and v.active and p.active and v.stock_qty - v.reserved_qty <= 2) s),
    'tasksDue', (select count(*) from public.nexo_work_items w where w.tenant_id=p_tenant and w.kind='task' and w.status='active'
      and w.due_at < v_today + interval '1 day' and (w.assignee_id=p_user or (w.assignee_id is null and w.created_by=p_user)))
  );
end; $$;

-- ---------- Catalog changes prepared by NEXO ----------
create table public.nexo_catalog_proposals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id text not null references public.jarvis_sessions(session_id) on delete cascade,
  request_key text not null,
  status text not null default 'pending' check (status in ('pending','applied','canceled','expired')),
  snapshot jsonb not null,
  product_id uuid references public.products(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '15 minutes',
  decided_at timestamptz
);
create unique index nexo_catalog_pending_request on public.nexo_catalog_proposals(session_id,user_id,request_key) where status='pending';
create index nexo_catalog_proposal_session on public.nexo_catalog_proposals(user_id,session_id,created_at desc);
create index nexo_catalog_proposal_tenant on public.nexo_catalog_proposals(tenant_id);
alter table public.nexo_catalog_proposals enable row level security;
revoke all on public.nexo_catalog_proposals from public,anon,authenticated;
grant select on public.nexo_catalog_proposals to authenticated;
grant all on public.nexo_catalog_proposals to service_role;
create policy nexo_catalog_proposal_owner_read on public.nexo_catalog_proposals for select to authenticated
using (user_id=(select auth.uid()) and exists (select 1 from public.tenant_members m where m.tenant_id=nexo_catalog_proposals.tenant_id and m.user_id=(select auth.uid()) and m.role in ('owner','agent')));

-- Product by product SKU, or by a variant SKU of that product.
create function public.nexo_catalog_product_for(p_tenant uuid, p_sku text)
returns public.products language sql stable security invoker set search_path='' as $$
  select p.* from public.products p where p.tenant_id=p_tenant and p.sku=upper(trim(p_sku))
  union all
  select p.* from public.product_variants v join public.products p on p.id=v.product_id
    where v.tenant_id=p_tenant and v.sku=upper(trim(p_sku)) and not exists(select 1 from public.products x where x.tenant_id=p_tenant and x.sku=upper(trim(p_sku)))
  limit 1;
$$;

create function public.nexo_prepare_catalog_change(p_tenant uuid, p_user uuid, p_session text, p_change jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  v_action text := p_change->>'action'; item jsonb; lines jsonb := '[]'; prod public.products; var record;
  v_after bigint; v_qty bigint; v_percent numeric; v_create jsonb; v_variants jsonb := '[]'; v_title text;
  fingerprint text; proposal public.nexo_catalog_proposals; v_photo_id uuid; v_photo_name text;
begin
  perform 1 from public.tenant_members where tenant_id=p_tenant and user_id=p_user and role in ('owner','agent') for share;
  if not found then raise exception 'CATALOG_FORBIDDEN'; end if;
  perform 1 from public.jarvis_sessions where session_id=p_session and tenant_id=p_tenant and user_id=p_user for share;
  if not found then raise exception 'CATALOG_FORBIDDEN'; end if;
  if jsonb_typeof(p_change) <> 'object' or v_action not in ('stock','price','availability','create') then raise exception 'CATALOG_INPUT'; end if;

  if v_action <> 'create' then
    if jsonb_typeof(p_change->'items') <> 'array' or jsonb_array_length(p_change->'items') not between 1 and 20 then raise exception 'CATALOG_INPUT'; end if;
    if jsonb_typeof(p_change->'percent') = 'number' then
      v_percent := (p_change->>'percent')::numeric;
      if v_percent < -90 or v_percent > 500 or v_percent = 0 then raise exception 'CATALOG_INPUT'; end if;
    end if;
    for item in select value from jsonb_array_elements(p_change->'items') loop
      if jsonb_typeof(item) <> 'object' or jsonb_typeof(item->'sku') <> 'string' or length(item->>'sku') not between 1 and 100 then raise exception 'CATALOG_INPUT'; end if;
      if v_action = 'stock' then
        select v.id, v.sku, v.stock_qty, v.reserved_qty, v.product_id, concat_ws(' · ', p.name, v.color, v.size) as label into var
          from public.product_variants v join public.products p on p.id=v.product_id
          where v.tenant_id=p_tenant and v.sku=upper(trim(item->>'sku'));
        if not found then
          -- A product SKU is accepted when the product has exactly one variant.
          select v.id, v.sku, v.stock_qty, v.reserved_qty, v.product_id, concat_ws(' · ', p.name, v.color, v.size) as label into var
            from public.products p join public.product_variants v on v.product_id=p.id
            where p.tenant_id=p_tenant and p.sku=upper(trim(item->>'sku'))
              and (select count(*) from public.product_variants z where z.product_id=p.id) = 1;
          if not found then raise exception 'CATALOG_SKU'; end if;
        end if;
        if jsonb_typeof(item->'qty') <> 'number' or (item->>'qty')::numeric <> trunc((item->>'qty')::numeric) then raise exception 'CATALOG_INPUT'; end if;
        v_qty := (item->>'qty')::numeric;
        if item->>'mode' = 'add' then
          if v_qty = 0 or abs(v_qty) > 100000 then raise exception 'CATALOG_INPUT'; end if;
          v_after := var.stock_qty + v_qty;
        elsif item->>'mode' = 'set' then
          v_after := v_qty;
        else raise exception 'CATALOG_INPUT'; end if;
        if v_after < 0 or v_after > 10000000 then raise exception 'CATALOG_INPUT'; end if;
        if v_after < var.reserved_qty then raise exception 'CATALOG_RESERVED'; end if;
        lines := lines || jsonb_build_array(jsonb_build_object('kind','stock','variant_id',var.id,'product_id',var.product_id,'sku',var.sku,
          'label',var.label,'before',var.stock_qty,'after',v_after,'reserved',var.reserved_qty));
      else
        select * into prod from public.nexo_catalog_product_for(p_tenant, item->>'sku');
        if prod.id is null then raise exception 'CATALOG_SKU'; end if;
        if lines @> jsonb_build_array(jsonb_build_object('product_id', prod.id)) then raise exception 'CATALOG_INPUT'; end if;
        if v_action = 'price' then
          if jsonb_typeof(item->'price') = 'number' then
            if (item->>'price')::numeric <> trunc((item->>'price')::numeric) then raise exception 'CATALOG_INPUT'; end if;
            v_after := (item->>'price')::numeric;
          elsif v_percent is not null then
            -- Colombian prices: rounded to the nearest $100.
            v_after := round(prod.price_retail * (1 + v_percent / 100) / 100) * 100;
          else raise exception 'CATALOG_INPUT'; end if;
          if v_after < 0 or v_after > 1000000000 then raise exception 'CATALOG_INPUT'; end if;
          lines := lines || jsonb_build_array(jsonb_build_object('kind','price','product_id',prod.id,'sku',prod.sku,'label',prod.name,'before',prod.price_retail,'after',v_after));
        else
          if jsonb_typeof(item->'active') <> 'boolean' then raise exception 'CATALOG_INPUT'; end if;
          lines := lines || jsonb_build_array(jsonb_build_object('kind','active','product_id',prod.id,'sku',prod.sku,'label',prod.name,'before',prod.active,'after',(item->>'active')::boolean));
        end if;
      end if;
    end loop;
    v_title := case v_action when 'stock' then 'Actualizar stock' when 'price' then 'Cambiar precios' else 'Cambiar disponibilidad' end;
  else
    v_create := p_change->'product';
    if jsonb_typeof(v_create) <> 'object' or nullif(trim(v_create->>'name'),'') is null or length(v_create->>'name') > 160
      or jsonb_typeof(v_create->'price_retail') <> 'number' or (v_create->>'price_retail')::numeric < 0
      or (v_create->>'price_retail')::numeric <> trunc((v_create->>'price_retail')::numeric) or (v_create->>'price_retail')::numeric > 1000000000
      or length(v_create->>'category') > 60 or length(v_create->>'description') > 2000 then raise exception 'CATALOG_INPUT'; end if;
    if v_create ? 'variants' then
      if jsonb_typeof(v_create->'variants') <> 'array' or jsonb_array_length(v_create->'variants') > 50 then raise exception 'CATALOG_INPUT'; end if;
      for item in select value from jsonb_array_elements(v_create->'variants') loop
        if jsonb_typeof(item) <> 'object' or length(item->>'color') > 40 or length(item->>'size') > 40
          or (item ? 'stock_qty' and (jsonb_typeof(item->'stock_qty') <> 'number' or (item->>'stock_qty')::numeric < 0 or (item->>'stock_qty')::numeric > 10000000)) then raise exception 'CATALOG_INPUT'; end if;
        v_variants := v_variants || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('color',nullif(trim(item->>'color'),''),'size',nullif(trim(item->>'size'),''),
          'stock_qty',coalesce(trunc((item->>'stock_qty')::numeric)::bigint,0))));
      end loop;
    end if;
    if jsonb_array_length(v_variants) = 0 then
      if v_create ? 'stock_qty' and (jsonb_typeof(v_create->'stock_qty') <> 'number' or (v_create->>'stock_qty')::numeric < 0 or (v_create->>'stock_qty')::numeric > 10000000) then raise exception 'CATALOG_INPUT'; end if;
      v_variants := jsonb_build_array(jsonb_build_object('stock_qty', coalesce(trunc((v_create->>'stock_qty')::numeric)::bigint,0)));
    end if;
    if p_change ? 'attachment_id' then
      select id, filename into v_photo_id, v_photo_name from public.jarvis_files where id=(p_change->>'attachment_id')::uuid and user_id=p_user and session_id=p_session
        and mime_type in ('image/png','image/jpeg','image/webp');
      if not found then raise exception 'CATALOG_PHOTO'; end if;
    end if;
    v_create := jsonb_strip_nulls(jsonb_build_object('name',trim(v_create->>'name'),'price_retail',trunc((v_create->>'price_retail')::numeric)::bigint,
      'category',nullif(trim(v_create->>'category'),''),'description',nullif(trim(v_create->>'description'),''),'active',true,'variants',v_variants));
    lines := jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('kind','create','label',v_create->>'name','after',v_create->'price_retail',
      'category',v_create->>'category','variants',v_variants,'photo',v_photo_name)));
    v_title := 'Agregar producto';
  end if;

  fingerprint := md5(p_change::text);
  perform pg_advisory_xact_lock(hashtextextended('catalog:' || p_session || p_user::text, 0));
  update public.nexo_catalog_proposals set status='expired', decided_at=now() where session_id=p_session and user_id=p_user and status='pending' and expires_at<=now();
  select * into proposal from public.nexo_catalog_proposals where session_id=p_session and user_id=p_user and request_key=fingerprint and status='pending';
  if found then return jsonb_build_object('ok',true,'proposal',to_jsonb(proposal)); end if;
  if (select count(*) from public.nexo_catalog_proposals where session_id=p_session and user_id=p_user and status='pending') >= 20 then raise exception 'CATALOG_LIMIT'; end if;
  insert into public.nexo_catalog_proposals(tenant_id,user_id,session_id,request_key,snapshot)
    values(p_tenant,p_user,p_session,fingerprint,jsonb_strip_nulls(jsonb_build_object('action',v_action,'title',v_title,'lines',lines,
      'create',v_create,'attachment_id',v_photo_id)))
    returning * into proposal;
  return jsonb_build_object('ok',true,'proposal',to_jsonb(proposal));
end; $$;

-- Applies a proposal only if nothing it shows changed since it was prepared.
create function public.nexo_decide_catalog_change(p_id uuid, p_user uuid, p_decision text, p_image_url text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare proposal public.nexo_catalog_proposals; line jsonb; cur record; v_result jsonb; v_product uuid;
begin
  if p_decision is null or p_decision not in ('confirm','cancel') then raise exception 'CATALOG_DECISION'; end if;
  select * into proposal from public.nexo_catalog_proposals where id=p_id and user_id=p_user for update;
  if not found then raise exception 'CATALOG_NOT_FOUND'; end if;
  if proposal.status <> 'pending' then return jsonb_build_object('ok',false,'code','decided','proposal',to_jsonb(proposal)); end if;
  if proposal.expires_at <= now() then
    update public.nexo_catalog_proposals set status='expired', decided_at=now() where id=p_id returning * into proposal;
    return jsonb_build_object('ok',false,'code','expired','proposal',to_jsonb(proposal));
  end if;
  perform 1 from public.tenant_members where tenant_id=proposal.tenant_id and user_id=p_user and role in ('owner','agent') for share;
  if not found then raise exception 'CATALOG_FORBIDDEN'; end if;
  if p_decision = 'cancel' then
    update public.nexo_catalog_proposals set status='canceled', decided_at=now() where id=p_id returning * into proposal;
    return jsonb_build_object('ok',true,'proposal',to_jsonb(proposal));
  end if;

  -- Validate every line under lock first: nothing is applied if anything changed.
  for line in select value from jsonb_array_elements(proposal.snapshot->'lines') loop
    if line->>'kind' = 'stock' then
      select stock_qty, reserved_qty into cur from public.product_variants where id=(line->>'variant_id')::uuid and tenant_id=proposal.tenant_id for update;
      if not found or cur.stock_qty <> (line->>'before')::bigint or (line->>'after')::bigint < cur.reserved_qty then
        return jsonb_build_object('ok',false,'code','changed','proposal',to_jsonb(proposal)); end if;
    elsif line->>'kind' = 'price' then
      select price_retail into cur from public.products where id=(line->>'product_id')::uuid and tenant_id=proposal.tenant_id for update;
      if not found or cur.price_retail <> (line->>'before')::bigint then return jsonb_build_object('ok',false,'code','changed','proposal',to_jsonb(proposal)); end if;
    elsif line->>'kind' = 'active' then
      select active into cur from public.products where id=(line->>'product_id')::uuid and tenant_id=proposal.tenant_id for update;
      if not found or cur.active <> (line->>'before')::boolean then return jsonb_build_object('ok',false,'code','changed','proposal',to_jsonb(proposal)); end if;
    end if;
  end loop;

  if proposal.snapshot->>'action' = 'create' then
    if p_image_url is not null and (length(p_image_url) > 1000 or p_image_url !~ '^https://') then raise exception 'CATALOG_PHOTO'; end if;
    v_result := public.nexo_catalog_upsert(proposal.tenant_id,
      (proposal.snapshot->'create') || case when p_image_url is null then '{}'::jsonb else jsonb_build_object('image_url',p_image_url) end, 'id', true);
    v_product := (v_result->>'id')::uuid;
  else
    for line in select value from jsonb_array_elements(proposal.snapshot->'lines') loop
      if line->>'kind' = 'stock' then
        update public.product_variants set stock_qty=(line->>'after')::bigint where id=(line->>'variant_id')::uuid and tenant_id=proposal.tenant_id;
        update public.products set updated_at=now() where id=(line->>'product_id')::uuid and tenant_id=proposal.tenant_id;
      elsif line->>'kind' = 'price' then
        update public.products set price_retail=(line->>'after')::bigint, updated_at=now() where id=(line->>'product_id')::uuid and tenant_id=proposal.tenant_id;
      else
        update public.products set active=(line->>'after')::boolean, updated_at=now() where id=(line->>'product_id')::uuid and tenant_id=proposal.tenant_id;
      end if;
    end loop;
    if jsonb_array_length(proposal.snapshot->'lines') = 1 then v_product := (proposal.snapshot->'lines'->0->>'product_id')::uuid; end if;
  end if;
  update public.nexo_catalog_proposals set status='applied', decided_at=now(), product_id=v_product where id=p_id returning * into proposal;
  return jsonb_build_object('ok',true,'proposal',to_jsonb(proposal));
end; $$;

revoke all on function public.nexo_sales_period(uuid,text), public.nexo_daily_briefing(uuid,uuid),
  public.nexo_catalog_product_for(uuid,text), public.nexo_prepare_catalog_change(uuid,uuid,text,jsonb),
  public.nexo_decide_catalog_change(uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.nexo_sales_period(uuid,text), public.nexo_daily_briefing(uuid,uuid),
  public.nexo_catalog_product_for(uuid,text), public.nexo_prepare_catalog_change(uuid,uuid,text,jsonb),
  public.nexo_decide_catalog_change(uuid,uuid,text,text) to service_role;
commit;
