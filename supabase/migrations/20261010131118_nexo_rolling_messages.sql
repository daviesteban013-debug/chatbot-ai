-- NEXO's customer allowance counts turns, independently of provider tokens.
begin;
create table public.nexo_message_limits (
  plan text primary key references public.credit_limits(plan),
  messages integer not null check (messages > 0)
);
insert into public.nexo_message_limits values
  ('trial',15), ('demo',20), ('esencial',40), ('crecimiento',100), ('equipo',200);
create table public.nexo_message_requests (
  id uuid primary key,
  owner_key text not null,
  tenant_id uuid references public.tenants(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  state text not null default 'reserved' check (state in ('reserved','completed','released')),
  created_at timestamptz not null default clock_timestamp(),
  finished_at timestamptz,
  check ((tenant_id is not null and user_id is null and owner_key='tenant:'||tenant_id::text)
    or (tenant_id is null and user_id is not null and owner_key='user:'||user_id::text)
    or (tenant_id is null and user_id is null and owner_key='demo:public'))
);
create index nexo_message_requests_window_idx on public.nexo_message_requests(owner_key,created_at)
  where state in ('reserved','completed');
create table public.nexo_model_requests (
  id uuid primary key,
  message_id uuid not null references public.nexo_message_requests(id) on delete cascade,
  state text not null default 'reserved' check (state in ('reserved','settled','released')),
  reserved_tokens integer not null check (reserved_tokens > 0 and reserved_tokens <= 200000),
  tokens_in bigint check (tokens_in >= 0), tokens_out bigint check (tokens_out >= 0),
  model text, created_at timestamptz not null default now(), finished_at timestamptz
);
create index nexo_model_requests_message_idx on public.nexo_model_requests(message_id);
alter table public.nexo_message_limits enable row level security;
alter table public.nexo_message_requests enable row level security;
alter table public.nexo_model_requests enable row level security;
-- Client reads go through an authenticated server route, never arbitrary owner IDs.
revoke all on public.nexo_message_limits, public.nexo_message_requests, public.nexo_model_requests from public,anon,authenticated;
grant all on public.nexo_message_limits, public.nexo_message_requests, public.nexo_model_requests to service_role;

create function public.nexo_message_balance(p_tenant_id uuid default null,p_user_id uuid default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  v_legacy jsonb; v_key text; v_plan text; v_quota integer; v_used integer; v_reserved integer;
  v_next timestamptz; v_full timestamptz; v_business text;
begin
  -- Reuses verified Stripe mode, subscription validity and owner resolution.
  v_legacy := public.credit_balance(p_tenant_id,p_user_id);
  v_key := v_legacy->>'ownerKey'; v_plan := v_legacy->>'plan';
  select messages into strict v_quota from public.nexo_message_limits where plan=v_plan;
  select count(*) filter(where state='completed'),count(*) filter(where state='reserved'),
    min(case when state='completed' then created_at+interval '3 hours' else created_at+interval '2 minutes' end),
    max(case when state='completed' then created_at+interval '3 hours' else created_at+interval '2 minutes' end)
    into v_used,v_reserved,v_next,v_full from public.nexo_message_requests
    where owner_key=v_key and ((state='completed' and created_at>now()-interval '3 hours')
      or (state='reserved' and created_at>now()-interval '2 minutes'));
  if p_tenant_id is not null then select name into v_business from public.tenants where id=p_tenant_id; end if;
  return jsonb_build_object('plan',v_plan,'businessName',v_business,'quotaMessages',v_quota,
    'usedMessages',v_used,'reservedMessages',v_reserved,'availableMessages',greatest(0,v_quota-v_used-v_reserved),
    'windowHours',3,'resetsAt',v_next,'fullyResetsAt',v_full);
end; $$;

create function public.reserve_nexo_message(p_id uuid,p_tenant_id uuid,p_user_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_balance jsonb; v_owner jsonb;
begin
  -- credit_balance's owner-period upsert locks the same row for all sessions of a business.
  -- That lock is held to transaction end, serializing competing reservations.
  v_owner := public.credit_balance(p_tenant_id,p_user_id);
  v_balance := public.nexo_message_balance(p_tenant_id,p_user_id);
  if exists(select 1 from public.nexo_message_requests where id=p_id) then raise exception 'nexo_message_duplicate'; end if;
  if (v_balance->>'availableMessages')::integer<=0 then return jsonb_build_object('ok',false,'balance',v_balance); end if;
  insert into public.nexo_message_requests(id,owner_key,tenant_id,user_id)
    values(p_id,v_owner->>'ownerKey',p_tenant_id,case when p_tenant_id is null then p_user_id end);
  return jsonb_build_object('ok',true);
end; $$;

create function public.finish_nexo_message(p_id uuid,p_completed boolean)
returns void language plpgsql security invoker set search_path='' as $$
begin
  if p_completed is null then raise exception 'nexo_completion_invalid'; end if;
  update public.nexo_message_requests set state=case when p_completed then 'completed' else 'released' end,
    finished_at=now() where id=p_id and state='reserved';
  if not found and not exists(select 1 from public.nexo_message_requests where id=p_id) then raise exception 'nexo_message_missing'; end if;
end; $$;

create function public.reserve_nexo_model(p_id uuid,p_message_id uuid,p_tenant_id uuid,p_user_id uuid,p_requested integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_turn public.nexo_message_requests; v_key text;
begin
  if p_requested is null or p_requested<=0 or p_requested>200000 then raise exception 'nexo_context_limit'; end if;
  v_key := case when p_tenant_id is not null then 'tenant:'||p_tenant_id::text
    when p_user_id is not null then 'user:'||p_user_id::text else 'demo:public' end;
  select * into v_turn from public.nexo_message_requests where id=p_message_id for update;
  if not found or v_turn.owner_key<>v_key or v_turn.state<>'reserved'
    or v_turn.created_at<=now()-interval '2 minutes' then raise exception 'nexo_message_invalid'; end if;
  if (select count(*) from public.nexo_model_requests where message_id=p_message_id)>=12 then raise exception 'nexo_model_limit'; end if;
  insert into public.nexo_model_requests(id,message_id,reserved_tokens) values(p_id,p_message_id,p_requested);
  return jsonb_build_object('ok',true,'reservedTokens',p_requested);
end; $$;

create function public.settle_nexo_model(p_id uuid,p_tokens_in bigint,p_tokens_out bigint,p_model text)
returns void language plpgsql security invoker set search_path='' as $$
declare v_row public.nexo_model_requests;
begin
  if p_tokens_in is null or p_tokens_out is null or p_tokens_in<0 or p_tokens_out<0 then raise exception 'nexo_usage_invalid'; end if;
  select * into v_row from public.nexo_model_requests where id=p_id for update;
  if not found then raise exception 'nexo_model_missing'; end if;
  if v_row.state='settled' then
    if v_row.tokens_in<>p_tokens_in or v_row.tokens_out<>p_tokens_out then raise exception 'nexo_usage_conflict'; end if;
    return;
  end if;
  if v_row.state<>'reserved' then raise exception 'nexo_model_released'; end if;
  update public.nexo_model_requests set state='settled',tokens_in=p_tokens_in,tokens_out=p_tokens_out,
    model=p_model,finished_at=now() where id=p_id;
end; $$;
create function public.release_nexo_model(p_id uuid)
returns void language plpgsql security invoker set search_path='' as $$
begin
  update public.nexo_model_requests set state='released',finished_at=now() where id=p_id and state='reserved';
  if not found and not exists(select 1 from public.nexo_model_requests where id=p_id and state='released') then raise exception 'nexo_release_invalid'; end if;
end; $$;

revoke execute on function public.nexo_message_balance(uuid,uuid), public.reserve_nexo_message(uuid,uuid,uuid),
  public.finish_nexo_message(uuid,boolean),public.reserve_nexo_model(uuid,uuid,uuid,uuid,integer),
  public.settle_nexo_model(uuid,bigint,bigint,text),public.release_nexo_model(uuid) from public,anon,authenticated;
grant execute on function public.nexo_message_balance(uuid,uuid), public.reserve_nexo_message(uuid,uuid,uuid),
  public.finish_nexo_message(uuid,boolean),public.reserve_nexo_model(uuid,uuid,uuid,uuid,integer),
  public.settle_nexo_model(uuid,bigint,bigint,text),public.release_nexo_model(uuid) to service_role;
commit;
