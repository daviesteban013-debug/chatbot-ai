begin;
-- Owner-controlled autonomy for LOW-RISK actions only: stock in/out, product availability,
-- internal memory and tasks. Prices, new products and orders always need a click.
-- Everything NEXO does on its own is logged and can be undone.

create table public.nexo_autonomy_settings (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  catalog_stock boolean not null default false,
  catalog_availability boolean not null default false,
  work_items boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.nexo_autonomy_settings enable row level security;
revoke all on public.nexo_autonomy_settings from public, anon, authenticated;
grant select on public.nexo_autonomy_settings to authenticated;
grant all on public.nexo_autonomy_settings to service_role;
create policy nexo_autonomy_settings_members_read on public.nexo_autonomy_settings for select to authenticated
  using (public.is_tenant_member(tenant_id));

create table public.nexo_activity_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  session_id text,
  kind text not null check (kind in ('catalog','work')),
  ref_id uuid not null,
  summary text not null check (length(summary) between 1 and 300),
  undo jsonb not null,
  status text not null default 'applied' check (status in ('applied','undone')),
  created_at timestamptz not null default now(),
  undone_at timestamptz,
  undone_by uuid references auth.users(id) on delete set null
);
create index nexo_activity_log_tenant on public.nexo_activity_log(tenant_id, created_at desc);
alter table public.nexo_activity_log enable row level security;
revoke all on public.nexo_activity_log from public, anon, authenticated;
grant select on public.nexo_activity_log to authenticated;
grant all on public.nexo_activity_log to service_role;
create policy nexo_activity_log_team_read on public.nexo_activity_log for select to authenticated
  using (exists (select 1 from public.tenant_members m where m.tenant_id=nexo_activity_log.tenant_id and m.user_id=(select auth.uid()) and m.role in ('owner','agent')));

alter table public.nexo_catalog_proposals add column applied_by_nexo boolean not null default false;

create function public.nexo_configure_autonomy(p_tenant uuid, p_user uuid, p_settings jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.nexo_autonomy_settings;
begin
  perform 1 from public.tenant_members where tenant_id=p_tenant and user_id=p_user and role='owner' for share;
  if not found then raise exception 'AUTONOMY_OWNER_REQUIRED'; end if;
  if jsonb_typeof(p_settings) <> 'object' or exists(select 1 from jsonb_object_keys(p_settings) k where k not in ('catalog_stock','catalog_availability','work_items'))
    or exists(select 1 from jsonb_each(p_settings) e where jsonb_typeof(e.value) <> 'boolean') then raise exception 'AUTONOMY_INPUT'; end if;
  insert into public.nexo_autonomy_settings as a(tenant_id, catalog_stock, catalog_availability, work_items, updated_by)
    values(p_tenant, coalesce((p_settings->>'catalog_stock')::boolean,false), coalesce((p_settings->>'catalog_availability')::boolean,false),
      coalesce((p_settings->>'work_items')::boolean,false), p_user)
    on conflict (tenant_id) do update set
      catalog_stock=coalesce((p_settings->>'catalog_stock')::boolean, a.catalog_stock),
      catalog_availability=coalesce((p_settings->>'catalog_availability')::boolean, a.catalog_availability),
      work_items=coalesce((p_settings->>'work_items')::boolean, a.work_items),
      updated_by=p_user, updated_at=now()
    returning * into s;
  return to_jsonb(s);
end; $$;

-- Catalog change requested to NEXO: applied at once only for enabled low-risk actions.
create function public.nexo_catalog_change_by_nexo(p_tenant uuid, p_user uuid, p_session text, p_change jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare prepared jsonb; decided jsonb; s public.nexo_autonomy_settings; proposal public.nexo_catalog_proposals;
  v_action text; v_summary text; v_undo jsonb; v_log uuid; n integer;
begin
  prepared := public.nexo_prepare_catalog_change(p_tenant, p_user, p_session, p_change);
  v_action := prepared->'proposal'->'snapshot'->>'action';
  select * into s from public.nexo_autonomy_settings where tenant_id=p_tenant;
  if prepared->'proposal'->>'status' <> 'pending' or s.tenant_id is null
    or not ((v_action='stock' and s.catalog_stock) or (v_action='availability' and s.catalog_availability)) then
    return prepared || jsonb_build_object('auto', false);
  end if;
  begin
    decided := public.nexo_decide_catalog_change((prepared->'proposal'->>'id')::uuid, p_user, 'confirm', null);
  exception when others then
    return prepared || jsonb_build_object('auto', false);
  end;
  if coalesce((decided->>'ok')::boolean, false) is false then return prepared || jsonb_build_object('auto', false); end if;
  update public.nexo_catalog_proposals set applied_by_nexo=true where id=(prepared->'proposal'->>'id')::uuid returning * into proposal;
  n := jsonb_array_length(proposal.snapshot->'lines');
  v_summary := case
    when v_action='stock' and n=1 then format('Stock de %s: %s → %s', proposal.snapshot->'lines'->0->>'label', proposal.snapshot->'lines'->0->>'before', proposal.snapshot->'lines'->0->>'after')
    when v_action='stock' then format('Actualizó el stock de %s productos', n)
    when n=1 then format('%s %s', case when (proposal.snapshot->'lines'->0->>'after')::boolean then 'Activó' else 'Ocultó' end, proposal.snapshot->'lines'->0->>'label')
    else format('Cambió la disponibilidad de %s productos', n) end;
  select jsonb_build_object('lines', jsonb_agg(jsonb_build_object('kind', l->>'kind', 'variant_id', l->'variant_id', 'product_id', l->'product_id',
      'from', l->'after', 'to', l->'before'))) into v_undo
    from jsonb_array_elements(proposal.snapshot->'lines') l;
  insert into public.nexo_activity_log(tenant_id, user_id, session_id, kind, ref_id, summary, undo)
    values(p_tenant, p_user, p_session, 'catalog', proposal.id, left(v_summary, 300), v_undo) returning id into v_log;
  return jsonb_build_object('ok', true, 'auto', true, 'log_id', v_log, 'proposal', to_jsonb(proposal));
end; $$;

-- Memory or task requested to NEXO: confirmed at once when the owner enabled it.
create function public.nexo_propose_work_by_nexo(p_tenant uuid, p_user uuid, p_session text, p_key uuid, p_input jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare w jsonb; s public.nexo_autonomy_settings; v_log uuid;
begin
  w := public.nexo_propose_work(p_tenant, p_user, p_session, p_key, p_input);
  select * into s from public.nexo_autonomy_settings where tenant_id=p_tenant;
  if w->>'status' <> 'proposed' or s.tenant_id is null or not s.work_items then return w || jsonb_build_object('auto', false); end if;
  begin
    w := public.nexo_change_work(p_tenant, p_user, (w->>'id')::uuid, (w->>'revision')::integer, 'confirm');
  exception when others then
    -- Anything unexpected (date already passed, assignee left) falls back to a normal proposal.
    return w || jsonb_build_object('auto', false);
  end;
  insert into public.nexo_activity_log(tenant_id, user_id, session_id, kind, ref_id, summary, undo)
    values(p_tenant, p_user, p_session, 'work', (w->>'id')::uuid,
      left(format('%s «%s»', case when w->>'kind'='task' then 'Creó la tarea' else 'Guardó el recuerdo' end, w->>'title'), 300),
      jsonb_build_object('item_id', w->>'id'))
    returning id into v_log;
  return w || jsonb_build_object('auto', true, 'log_id', v_log);
end; $$;

-- Undo within 7 days, only if nothing changed after NEXO's action.
create function public.nexo_undo_activity(p_tenant uuid, p_user uuid, p_log uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare l public.nexo_activity_log; line jsonb; cur record; w public.nexo_work_items;
begin
  perform 1 from public.tenant_members where tenant_id=p_tenant and user_id=p_user and role in ('owner','agent') for share;
  if not found then raise exception 'ACTIVITY_FORBIDDEN'; end if;
  select * into l from public.nexo_activity_log where id=p_log and tenant_id=p_tenant for update;
  if not found then raise exception 'ACTIVITY_NOT_FOUND'; end if;
  if l.status <> 'applied' then return jsonb_build_object('ok', false, 'code', 'undone'); end if;
  if l.created_at < now() - interval '7 days' then return jsonb_build_object('ok', false, 'code', 'too_old'); end if;
  if l.kind = 'catalog' then
    for line in select value from jsonb_array_elements(l.undo->'lines') loop
      if line->>'kind' = 'stock' then
        select stock_qty, reserved_qty into cur from public.product_variants where id=(line->>'variant_id')::uuid and tenant_id=p_tenant for update;
        if not found or cur.stock_qty <> (line->>'from')::bigint or (line->>'to')::bigint < cur.reserved_qty then return jsonb_build_object('ok', false, 'code', 'changed'); end if;
      else
        select active into cur from public.products where id=(line->>'product_id')::uuid and tenant_id=p_tenant for update;
        if not found or cur.active <> (line->>'from')::boolean then return jsonb_build_object('ok', false, 'code', 'changed'); end if;
      end if;
    end loop;
    for line in select value from jsonb_array_elements(l.undo->'lines') loop
      if line->>'kind' = 'stock' then
        update public.product_variants set stock_qty=(line->>'to')::bigint where id=(line->>'variant_id')::uuid and tenant_id=p_tenant;
      else
        update public.products set active=(line->>'to')::boolean, updated_at=now() where id=(line->>'product_id')::uuid and tenant_id=p_tenant;
      end if;
    end loop;
  else
    select * into w from public.nexo_work_items where id=(l.undo->>'item_id')::uuid and tenant_id=p_tenant;
    if not found or w.status <> 'active' then return jsonb_build_object('ok', false, 'code', 'changed'); end if;
    perform public.nexo_change_work(p_tenant, p_user, w.id, w.revision, 'cancel');
  end if;
  update public.nexo_activity_log set status='undone', undone_at=now(), undone_by=p_user where id=l.id;
  return jsonb_build_object('ok', true);
end; $$;

-- What NEXO did on its own: chat actions, WhatsApp payment reminders and WhatsApp sales.
create function public.nexo_activity_feed(p_tenant uuid, p_user uuid, p_limit integer default 20)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin
  if not exists(select 1 from public.tenant_members where tenant_id=p_tenant and user_id=p_user and role in ('owner','agent')) then raise exception 'ACTIVITY_FORBIDDEN'; end if;
  return coalesce((select jsonb_agg(x order by x.at desc) from (
    (select l.created_at as at, l.kind, l.summary as text,
        case when l.kind='catalog' then '/dashboard/catalog' else '/dashboard/workspace' end as href,
        l.id as log_id, l.status, (l.status='applied' and l.created_at > now() - interval '7 days') as undoable
      from public.nexo_activity_log l where l.tenant_id=p_tenant and l.created_at > now() - interval '30 days'
      order by l.created_at desc limit 50)
    union all
    (select coalesce(f.dispatched_at, f.updated_at), 'reminder',
        format('Recordó el pago a %s', coalesce(nullif(c.name,''), c.phone)),
        '/dashboard/orders/' || f.order_id, null::uuid, 'applied', false
      from public.nexo_sales_followups f join public.customers c on c.id=f.customer_id
      where f.tenant_id=p_tenant and f.status='sent' and coalesce(f.dispatched_at, f.updated_at) > now() - interval '30 days'
      order by 1 desc limit 50)
    union all
    (select o.created_at, 'sale',
        format('Vendió $%s a %s por WhatsApp', replace(to_char(o.total, 'FM999,999,999,990'), ',', '.'), coalesce(nullif(c.name,''), c.phone)),
        '/dashboard/orders/' || o.id, null::uuid, 'applied', false
      from public.orders o join public.customers c on c.id=o.customer_id
      where o.tenant_id=p_tenant and o.created_by='agent' and o.status::text in ('pending_payment','confirmed','shipped','delivered')
        and o.created_at > now() - interval '30 days'
      order by 1 desc limit 50)
    order by 1 desc limit least(greatest(p_limit, 1), 50)) x), '[]'::jsonb);
end; $$;

revoke all on function public.nexo_configure_autonomy(uuid,uuid,jsonb), public.nexo_catalog_change_by_nexo(uuid,uuid,text,jsonb),
  public.nexo_propose_work_by_nexo(uuid,uuid,text,uuid,jsonb), public.nexo_undo_activity(uuid,uuid,uuid),
  public.nexo_activity_feed(uuid,uuid,integer) from public, anon, authenticated;
grant execute on function public.nexo_configure_autonomy(uuid,uuid,jsonb), public.nexo_catalog_change_by_nexo(uuid,uuid,text,jsonb),
  public.nexo_propose_work_by_nexo(uuid,uuid,text,uuid,jsonb), public.nexo_undo_activity(uuid,uuid,uuid),
  public.nexo_activity_feed(uuid,uuid,integer) to service_role;
commit;
