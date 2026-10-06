-- Credits are integer tokens internally; 1 displayed credit = 1,000 tokens.
-- Only the server's service role may reserve, settle or release credits.
begin;

alter table public.tenants
  add column stripe_subscription_status text not null default 'unknown',
  add column stripe_current_period_end timestamptz;

create table public.credit_limits (
  plan text primary key,
  tokens bigint not null check (tokens >= 0)
);
insert into public.credit_limits(plan, tokens) values
  ('esencial', 1000000), ('crecimiento', 4000000), ('equipo', 10000000),
  ('trial', 20000), ('demo', 100000);

create table public.credit_periods (
  owner_key text not null,
  period_start date not null,
  tenant_id uuid references public.tenants(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  resets_at timestamptz not null,
  quota_tokens bigint not null check (quota_tokens >= 0),
  used_tokens bigint not null default 0 check (used_tokens >= 0),
  reserved_tokens bigint not null default 0 check (reserved_tokens >= 0),
  primary key (owner_key, period_start),
  check (
    (tenant_id is not null and user_id is null and owner_key = 'tenant:' || tenant_id::text)
    or (user_id is not null and tenant_id is null and owner_key = 'user:' || user_id::text)
    or (tenant_id is null and user_id is null and owner_key = 'demo:public')
  )
);
create index credit_periods_tenant_idx on public.credit_periods(tenant_id) where tenant_id is not null;
create index credit_periods_user_idx on public.credit_periods(user_id) where user_id is not null;

create table public.credit_requests (
  id uuid primary key,
  owner_key text not null,
  period_start date not null,
  channel text not null check (channel in ('web', 'whatsapp')),
  state text not null default 'reserved' check (state in ('reserved', 'settled', 'released')),
  reserved_tokens bigint not null check (reserved_tokens > 0),
  tokens_in bigint check (tokens_in >= 0),
  tokens_out bigint check (tokens_out >= 0),
  model text,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  foreign key(owner_key, period_start) references public.credit_periods(owner_key, period_start) on delete cascade
);
create index credit_requests_period_idx on public.credit_requests(owner_key, period_start, created_at desc);

alter table public.credit_limits enable row level security;
alter table public.credit_periods enable row level security;
alter table public.credit_requests enable row level security;
create policy credit_periods_read on public.credit_periods for select to authenticated
  using (user_id = (select auth.uid()) or (tenant_id is not null and public.is_tenant_member(tenant_id)));
create policy credit_requests_read on public.credit_requests for select to authenticated
  using (exists (select 1 from public.credit_periods p
    where p.owner_key = credit_requests.owner_key and p.period_start = credit_requests.period_start));
revoke all on public.credit_limits, public.credit_periods, public.credit_requests from anon, authenticated;
grant select on public.credit_periods, public.credit_requests to authenticated;
grant all on public.credit_limits, public.credit_periods, public.credit_requests to service_role;

-- Trusted identity comes from membership resolution in the web route or signed WhatsApp webhook.
-- Unknown/inactive subscriptions receive only the explicitly configured trial allowance.
create function public.credit_balance(p_tenant_id uuid default null, p_user_id uuid default null)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_key text;
  v_plan text := 'trial';
  v_quota bigint;
  v_start date := date_trunc('month', now() at time zone 'UTC')::date;
  v_reset timestamptz := (date_trunc('month', now() at time zone 'UTC') + interval '1 month') at time zone 'UTC';
  v_row public.credit_periods;
begin
  if p_tenant_id is not null then
    v_key := 'tenant:' || p_tenant_id::text;
    select case when t.stripe_subscription_status in ('active', 'trialing')
      and t.stripe_current_period_end > now() then t.plan else 'trial' end
      into v_plan from public.tenants t where t.id = p_tenant_id and t.status = 'active';
    if not found then raise exception 'credit_owner_invalid'; end if;
  elsif p_user_id is not null then
    v_key := 'user:' || p_user_id::text;
  else
    v_key := 'demo:public'; v_plan := 'demo';
    v_start := (now() at time zone 'UTC')::date;
    v_reset := (v_start + interval '1 day') at time zone 'UTC';
  end if;
  select tokens into v_quota from public.credit_limits where plan = v_plan;
  if v_quota is null then raise exception 'credit_plan_invalid'; end if;
  insert into public.credit_periods(owner_key, period_start, tenant_id, user_id, resets_at, quota_tokens)
    values(v_key, v_start, p_tenant_id, case when p_tenant_id is null then p_user_id end, v_reset, v_quota)
    on conflict(owner_key, period_start) do update set quota_tokens = excluded.quota_tokens
    returning * into v_row;
  return jsonb_build_object('ownerKey', v_key, 'periodStart', v_start, 'resetsAt', v_reset,
    'quotaTokens', v_row.quota_tokens, 'usedTokens', v_row.used_tokens,
    'reservedTokens', v_row.reserved_tokens,
    'availableTokens', greatest(0, v_row.quota_tokens - v_row.used_tokens - v_row.reserved_tokens),
    'plan', v_plan);
end;
$$;

create function public.reserve_credits(p_id uuid, p_tenant_id uuid, p_user_id uuid,
  p_requested bigint, p_minimum bigint, p_channel text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_balance jsonb;
  v_key text;
  v_start date;
  v_row public.credit_periods;
  v_request public.credit_requests;
  v_granted bigint;
begin
  if p_requested <= 0 or p_minimum <= 0 or p_minimum > p_requested then
    raise exception 'credit_reservation_invalid';
  end if;
  v_balance := public.credit_balance(p_tenant_id, p_user_id);
  v_key := v_balance->>'ownerKey'; v_start := (v_balance->>'periodStart')::date;
  select * into v_row from public.credit_periods
    where owner_key = v_key and period_start = v_start for update;
  select * into v_request from public.credit_requests where id = p_id;
  if found then
    -- Retrying a reservation never authorizes a second upstream request.
    raise exception 'credit_request_duplicate';
  end if;
  v_granted := least(p_requested, v_row.quota_tokens - v_row.used_tokens - v_row.reserved_tokens);
  if v_granted < p_minimum then
    return jsonb_build_object('ok', false, 'balance', v_balance);
  end if;
  insert into public.credit_requests(id, owner_key, period_start, channel, reserved_tokens)
    values(p_id, v_key, v_start, p_channel, v_granted);
  update public.credit_periods set reserved_tokens = reserved_tokens + v_granted
    where owner_key = v_key and period_start = v_start;
  return jsonb_build_object('ok', true, 'reservedTokens', v_granted);
end;
$$;

create function public.settle_credits(p_id uuid, p_tokens_in bigint, p_tokens_out bigint, p_model text)
returns void language plpgsql security invoker set search_path = '' as $$
declare v_request public.credit_requests;
begin
  if p_tokens_in < 0 or p_tokens_out < 0 or p_tokens_in is null or p_tokens_out is null then
    raise exception 'credit_usage_invalid';
  end if;
  select * into v_request from public.credit_requests where id = p_id for update;
  if not found then raise exception 'credit_request_missing'; end if;
  if v_request.state = 'settled' then
    if v_request.tokens_in <> p_tokens_in or v_request.tokens_out <> p_tokens_out then
      raise exception 'credit_usage_conflict';
    end if;
    return;
  end if;
  if v_request.state <> 'reserved' then raise exception 'credit_request_released'; end if;
  -- Actual provider usage is never silently capped, even if a provider exceeds the reserved estimate.
  update public.credit_periods set reserved_tokens = reserved_tokens - v_request.reserved_tokens,
    used_tokens = used_tokens + p_tokens_in + p_tokens_out
    where owner_key = v_request.owner_key and period_start = v_request.period_start;
  update public.credit_requests set state = 'settled', tokens_in = p_tokens_in,
    tokens_out = p_tokens_out, model = p_model, finished_at = now() where id = p_id;
end;
$$;

create function public.release_credits(p_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare v_request public.credit_requests;
begin
  select * into v_request from public.credit_requests where id = p_id for update;
  if not found then raise exception 'credit_request_missing'; end if;
  if v_request.state = 'released' then return; end if;
  if v_request.state <> 'reserved' then raise exception 'credit_request_settled'; end if;
  update public.credit_periods set reserved_tokens = reserved_tokens - v_request.reserved_tokens
    where owner_key = v_request.owner_key and period_start = v_request.period_start;
  update public.credit_requests set state = 'released', finished_at = now() where id = p_id;
end;
$$;

revoke execute on function public.credit_balance(uuid, uuid),
  public.reserve_credits(uuid, uuid, uuid, bigint, bigint, text),
  public.settle_credits(uuid, bigint, bigint, text), public.release_credits(uuid) from public, anon, authenticated;
grant execute on function public.credit_balance(uuid, uuid),
  public.reserve_credits(uuid, uuid, uuid, bigint, bigint, text),
  public.settle_credits(uuid, bigint, bigint, text), public.release_credits(uuid) to service_role;
commit;
