begin;
alter table public.tenants add column stripe_mode text not null default 'test' check (stripe_mode in ('test','live'));
create table public.billing_settings (
  id boolean primary key default true check (id),
  mode text not null check (mode in ('test','live'))
);
insert into public.billing_settings(id,mode) values(true,'test');
create table public.billing_accounts (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  mode text not null check (mode in ('test','live')),
  customer_id text not null,
  subscription_id text,
  checkout_attempt uuid,
  checkout_plan text,
  checkout_annual boolean,
  checkout_expires_at timestamptz,
  primary key(tenant_id,mode), unique(mode,customer_id), unique(mode,subscription_id)
);
alter table public.billing_settings enable row level security;
alter table public.billing_accounts enable row level security;
revoke all on public.billing_settings, public.billing_accounts from anon, authenticated;
grant all on public.billing_settings, public.billing_accounts to service_role;

-- Serialize checkout creation, including simultaneous requests for different plans.
create function public.claim_billing_checkout(p_tenant_id uuid,p_mode text,p_plan text,p_annual boolean)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare a public.billing_accounts;
begin
  select * into a from public.billing_accounts where tenant_id=p_tenant_id and mode=p_mode for update;
  if not found then raise exception 'billing_account_missing'; end if;
  if a.checkout_expires_at > now() then
    if a.checkout_plan <> p_plan or a.checkout_annual <> p_annual then return jsonb_build_object('ok',false); end if;
  else
    update public.billing_accounts set checkout_attempt=gen_random_uuid(),checkout_plan=p_plan,
      checkout_annual=p_annual,checkout_expires_at=date_trunc('second',now())+interval '31 minutes'
      where tenant_id=p_tenant_id and mode=p_mode returning * into a;
  end if;
  return jsonb_build_object('ok',true,'attempt',a.checkout_attempt,'expiresAt',extract(epoch from a.checkout_expires_at)::bigint);
end;
$$;
revoke all on function public.claim_billing_checkout(uuid,text,text,boolean) from public, anon, authenticated;
grant execute on function public.claim_billing_checkout(uuid,text,text,boolean) to service_role;
create or replace function public.credit_balance(p_tenant_id uuid default null, p_user_id uuid default null)
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
      and t.stripe_current_period_end > now()
      and t.stripe_mode = (select mode from public.billing_settings where id=true) then t.plan else 'trial' end
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


commit;
