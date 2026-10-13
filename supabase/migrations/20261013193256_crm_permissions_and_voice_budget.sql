-- Business state is written through authorized server operations, never directly
-- by a browser member. Keep member reads and existing safe column grants.
create or replace function public.is_tenant_member(t uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.tenant_members m where m.tenant_id=t and m.user_id=(select auth.uid()));
$$;
revoke all on function public.is_tenant_member(uuid) from public,anon;
grant execute on function public.is_tenant_member(uuid) to authenticated,service_role;
do $$ declare t text; begin
  foreach t in array array['agents','products','product_variants','customers','conversations','messages','orders','order_items','handoffs','agent_runs','eval_cases','eval_results'] loop
    execute format('drop policy if exists %I on public.%I',t||'_tenant_all',t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_tenant_member(tenant_id))',t||'_members_read',t);
    execute format('revoke insert,update,delete,truncate,references,trigger on public.%I from public,anon,authenticated',t);
  end loop;
end $$;
-- A business-wide agent configuration belongs to its owner. Personal voice/color
-- preferences stored in the user's own metadata remain independent.
drop policy jarvis_configs_tenant_all on public.jarvis_configs;
create policy jarvis_configs_members_read on public.jarvis_configs for select to authenticated using(public.is_tenant_member(tenant_id));
create policy jarvis_configs_owner_insert on public.jarvis_configs for insert to authenticated
  with check(exists(select 1 from public.tenant_members m where m.tenant_id=jarvis_configs.tenant_id and m.user_id=(select auth.uid()) and m.role='owner'));
create policy jarvis_configs_owner_update on public.jarvis_configs for update to authenticated
  using(exists(select 1 from public.tenant_members m where m.tenant_id=jarvis_configs.tenant_id and m.user_id=(select auth.uid()) and m.role='owner'))
  with check(exists(select 1 from public.tenant_members m where m.tenant_id=jarvis_configs.tenant_id and m.user_id=(select auth.uid()) and m.role='owner'));
revoke delete,truncate,references,trigger on public.jarvis_configs from public,anon,authenticated;
grant select,insert,update on public.jarvis_configs to authenticated;

create or replace function public.reserve_variant_stock(p_variant uuid,p_qty integer)
returns boolean language plpgsql security invoker set search_path='' as $$
declare ok boolean;
begin
  if p_qty is null or p_qty<=0 then raise exception 'STOCK_INVALID_QUANTITY'; end if;
  update public.product_variants set reserved_qty=reserved_qty+p_qty
    where id=p_variant and active and stock_qty-reserved_qty>=p_qty returning true into ok;
  return coalesce(ok,false);
end $$;
create or replace function public.release_variant_stock(p_variant uuid,p_qty integer)
returns void language plpgsql security invoker set search_path='' as $$
begin
  if p_qty is null or p_qty<=0 then raise exception 'STOCK_INVALID_QUANTITY'; end if;
  update public.product_variants set reserved_qty=greatest(reserved_qty-p_qty,0) where id=p_variant;
end $$;
revoke all on function public.reserve_variant_stock(uuid,integer),public.release_variant_stock(uuid,integer) from public,anon,authenticated;
grant execute on function public.reserve_variant_stock(uuid,integer),public.release_variant_stock(uuid,integer) to service_role;

-- Durable provider safety budgets: 20,000 TTS characters / 10 minutes per
-- business; STT uses a separate budget of 40 bounded clips / 10 minutes.
-- No text, audio, credentials or provider payload is persisted in these tables.
create table public.nexo_voice_buckets (
  owner_key text not null,
  channel text not null check(channel in ('tts','stt')),
  window_started_at timestamptz not null default clock_timestamp(),
  used_units integer not null default 0 check(used_units between 0 and 20000),
  primary key(owner_key,channel)
);
create table public.nexo_voice_callers (
  user_id uuid not null references auth.users(id) on delete cascade,
  channel text not null check(channel in ('tts','stt')),
  slots numeric not null default 3 check(slots between 0 and 3),
  last_refill_at timestamptz not null default clock_timestamp(),
  active_request uuid,
  active_until timestamptz,
  primary key(user_id,channel)
);
create table public.nexo_voice_requests (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  tenant_id uuid references public.tenants(id) on delete cascade,
  owner_key text not null,
  channel text not null check(channel in ('tts','stt')),
  units integer not null check(units between 1 and 4000),
  state text not null default 'reserved' check(state in ('reserved','completed','failed','unknown','expired')),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default clock_timestamp()+interval '60 seconds',
  finished_at timestamptz,
  check((tenant_id is not null and owner_key='tenant:'||tenant_id::text) or (tenant_id is null and owner_key='user:'||user_id::text))
);
create index nexo_voice_requests_retention on public.nexo_voice_requests(created_at);
create index nexo_voice_requests_user on public.nexo_voice_requests(user_id);
create index nexo_voice_requests_tenant on public.nexo_voice_requests(tenant_id);
alter table public.nexo_voice_buckets enable row level security;
alter table public.nexo_voice_callers enable row level security;
alter table public.nexo_voice_requests enable row level security;
revoke all on public.nexo_voice_buckets,public.nexo_voice_callers,public.nexo_voice_requests from public,anon,authenticated;
grant all on public.nexo_voice_buckets,public.nexo_voice_callers,public.nexo_voice_requests to service_role;

create function public.nexo_reserve_voice(p_id uuid,p_user uuid,p_tenant uuid,p_channel text,p_units integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare caller public.nexo_voice_callers; bucket public.nexo_voice_buckets; key text; instant timestamptz:=clock_timestamp(); refill numeric; retry integer;
begin
  if p_id is null or p_user is null or p_channel is null or p_channel not in ('tts','stt') or p_units is null
    or p_units not between 1 and 4000 or (p_channel='stt' and p_units<>500) then raise exception 'VOICE_INVALID_REQUEST'; end if;
  if p_tenant is not null then
    if not exists(select 1 from public.tenant_members m join public.tenants t on t.id=m.tenant_id where m.user_id=p_user and m.tenant_id=p_tenant and t.status='active') then raise exception 'VOICE_MEMBER_REQUIRED'; end if;
    key:='tenant:'||p_tenant::text;
  else
    -- An existing business member cannot bypass its shared quota with a personal bucket.
    if exists(select 1 from public.tenant_members where user_id=p_user) then raise exception 'VOICE_TENANT_REQUIRED'; end if;
    key:='user:'||p_user::text;
  end if;
  insert into public.nexo_voice_callers(user_id,channel) values(p_user,p_channel) on conflict do nothing;
  select * into caller from public.nexo_voice_callers where user_id=p_user and channel=p_channel for update;
  if exists(select 1 from public.nexo_voice_requests where id=p_id) then raise exception 'VOICE_DUPLICATE_REQUEST'; end if;
  if caller.active_until>instant then
    return jsonb_build_object('ok',false,'reason','busy','retryAfterSeconds',greatest(1,ceil(extract(epoch from caller.active_until-instant))::integer));
  end if;
  if caller.active_request is not null then
    update public.nexo_voice_requests set state='expired',finished_at=instant where id=caller.active_request and state='reserved';
  end if;
  refill:=least(3,caller.slots+greatest(0,extract(epoch from instant-caller.last_refill_at))/2);
  if refill<1 then return jsonb_build_object('ok',false,'reason','rate','retryAfterSeconds',greatest(1,ceil((1-refill)*2)::integer)); end if;
  insert into public.nexo_voice_buckets(owner_key,channel) values(key,p_channel) on conflict do nothing;
  select * into bucket from public.nexo_voice_buckets where owner_key=key and channel=p_channel for update;
  if bucket.window_started_at+interval '10 minutes'<=instant then bucket.used_units:=0;bucket.window_started_at:=instant; end if;
  if bucket.used_units+p_units>20000 then
    retry:=greatest(1,ceil(extract(epoch from bucket.window_started_at+interval '10 minutes'-instant))::integer);
    return jsonb_build_object('ok',false,'reason','quota','retryAfterSeconds',retry);
  end if;
  update public.nexo_voice_buckets set used_units=bucket.used_units+p_units,window_started_at=bucket.window_started_at where owner_key=key and channel=p_channel;
  insert into public.nexo_voice_requests(id,user_id,tenant_id,owner_key,channel,units,created_at,expires_at)
    values(p_id,p_user,p_tenant,key,p_channel,p_units,instant,instant+interval '60 seconds');
  update public.nexo_voice_callers set slots=refill-1,last_refill_at=instant,active_request=p_id,active_until=instant+interval '60 seconds' where user_id=p_user and channel=p_channel;
  return jsonb_build_object('ok',true,'requestId',p_id);
end $$;

create function public.nexo_finish_voice(p_id uuid,p_user uuid,p_outcome text)
returns void language plpgsql security invoker set search_path='' as $$
declare request public.nexo_voice_requests;
begin
  if p_outcome is null or p_outcome not in ('completed','failed','unknown') then raise exception 'VOICE_INVALID_OUTCOME'; end if;
  select * into request from public.nexo_voice_requests where id=p_id and user_id=p_user;
  if not found then raise exception 'VOICE_REQUEST_NOT_FOUND'; end if;
  -- Same lock order as reserve. A late completion must not release a newer call.
  perform 1 from public.nexo_voice_callers where user_id=p_user and channel=request.channel for update;
  update public.nexo_voice_requests set state=p_outcome,finished_at=clock_timestamp() where id=p_id and user_id=p_user and state='reserved';
  update public.nexo_voice_callers set active_request=null,active_until=null where user_id=p_user and channel=request.channel and active_request=p_id;
  -- Provider errors/cancellations do not refund units: unknown work may be billed.
end $$;

create function public.nexo_prune_voice_usage() returns void
language plpgsql security invoker set search_path='' as $$
begin
  delete from public.nexo_voice_requests where created_at<clock_timestamp()-interval '7 days';
  delete from public.nexo_voice_buckets where window_started_at<clock_timestamp()-interval '7 days';
end $$;
revoke all on function public.nexo_reserve_voice(uuid,uuid,uuid,text,integer),public.nexo_finish_voice(uuid,uuid,text),public.nexo_prune_voice_usage() from public,anon,authenticated;
grant execute on function public.nexo_reserve_voice(uuid,uuid,uuid,text,integer),public.nexo_finish_voice(uuid,uuid,text),public.nexo_prune_voice_usage() to service_role;
do $$ begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    perform cron.schedule('nexo-voice-usage-retention','15 * * * *','select public.nexo_prune_voice_usage()');
  end if;
end $$;
