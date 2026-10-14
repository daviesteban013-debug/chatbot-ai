begin;
-- NEXO plans are billed with Mercado Pago (Colombia, COP); Stripe is removed.
-- Every approved payment (automatic subscription charge or one-time period) extends
-- tenants.plan_active_until. credit_balance() is the only entitlement decision.

alter table public.tenants
  add column plan_active_until timestamptz,
  add column billing_mode text check (billing_mode in ('test','live')),
  add column mp_preapproval_id text,
  add column mp_preapproval_status text;
create unique index tenants_mp_preapproval_uidx on public.tenants(mp_preapproval_id) where mp_preapproval_id is not null;

create table public.billing_checkouts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  mode text not null check (mode in ('test','live')),
  kind text not null check (kind in ('subscription','one_time')),
  plan text not null check (plan in ('esencial','crecimiento','equipo')),
  annual boolean not null,
  amount_cop bigint not null check (amount_cop > 0),
  mp_ref text,
  checkout_url text,
  status text not null default 'open' check (status in ('open','completed','canceled')),
  created_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index billing_checkouts_tenant_idx on public.billing_checkouts(tenant_id, created_at desc);
create unique index billing_checkouts_ref_uidx on public.billing_checkouts(mp_ref) where mp_ref is not null;

create table public.billing_payments (
  mp_payment_id text primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  checkout_id uuid not null references public.billing_checkouts(id) on delete cascade,
  mode text not null check (mode in ('test','live')),
  plan text not null,
  annual boolean not null,
  amount_cop bigint not null,
  status text not null,
  period_start timestamptz,
  period_end timestamptz,
  needs_review boolean not null default false,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index billing_payments_tenant_idx on public.billing_payments(tenant_id, created_at desc);

alter table public.billing_checkouts enable row level security;
alter table public.billing_payments enable row level security;
revoke all on public.billing_checkouts, public.billing_payments from anon, authenticated;
grant all on public.billing_checkouts, public.billing_payments to service_role;

-- Serializes checkout creation per business. Amounts come from the server, never the browser.
create function public.nexo_claim_mp_checkout(p_tenant uuid,p_user uuid,p_mode text,p_kind text,p_plan text,p_annual boolean,p_amount bigint)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare t public.tenants; c public.billing_checkouts;
begin
  if p_mode is distinct from (select mode from public.billing_settings where id=true) then raise exception 'billing_mode_mismatch'; end if;
  select * into t from public.tenants where id=p_tenant and status='active' for update;
  if not found then raise exception 'billing_tenant_invalid'; end if;
  if not exists(select 1 from public.tenant_members where tenant_id=p_tenant and user_id=p_user and role='owner') then
    raise exception 'billing_owner_required';
  end if;
  if t.mp_preapproval_status='authorized' and t.billing_mode=p_mode then
    return jsonb_build_object('ok',false,'reason','subscribed');
  end if;
  if t.billing_mode=p_mode and t.plan_active_until>now() and t.plan<>p_plan then
    return jsonb_build_object('ok',false,'reason','plan_change','activeUntil',t.plan_active_until);
  end if;
  select * into c from public.billing_checkouts where tenant_id=p_tenant and mode=p_mode and status='open'
    and kind=p_kind and plan=p_plan and annual=p_annual and amount_cop=p_amount
    and expires_at>now()+interval '5 minutes' and checkout_url is not null
    order by created_at desc limit 1;
  if found then return jsonb_build_object('ok',true,'id',c.id,'url',c.checkout_url,'reused',true); end if;
  -- A new choice replaces abandoned links; a late payment on them is still recorded.
  update public.billing_checkouts set status='canceled' where tenant_id=p_tenant and mode=p_mode and status='open';
  insert into public.billing_checkouts(tenant_id,mode,kind,plan,annual,amount_cop,created_by,expires_at)
    values(p_tenant,p_mode,p_kind,p_plan,p_annual,p_amount,p_user,
      now()+case when p_kind='one_time' then interval '3 days' else interval '1 day' end)
    returning * into c;
  return jsonb_build_object('ok',true,'id',c.id,'reused',false,'expiresAt',c.expires_at);
end; $$;

-- Applies a payment fetched from Mercado Pago's API. Idempotent per payment id;
-- refunds and chargebacks remove the unconsumed part of that payment's period.
create function public.nexo_apply_mp_payment(p_payment_id text,p_checkout uuid,p_mode text,p_status text,p_amount numeric,p_currency text,p_raw jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare c public.billing_checkouts; t public.tenants; p public.billing_payments; v_found boolean;
  v_start timestamptz; v_end timestamptz;
begin
  if nullif(p_payment_id,'') is null or length(p_payment_id)>64 then raise exception 'billing_payment_invalid'; end if;
  if p_status not in ('approved','pending','in_process','authorized','in_mediation','rejected','cancelled','refunded','charged_back') then
    raise exception 'billing_status_invalid';
  end if;
  select * into c from public.billing_checkouts where id=p_checkout;
  if not found then return jsonb_build_object('ok',false,'reason','checkout_unknown'); end if;
  if c.mode<>p_mode then return jsonb_build_object('ok',false,'reason','mode'); end if;
  if p_currency is distinct from 'COP' or p_amount is distinct from c.amount_cop::numeric then
    return jsonb_build_object('ok',false,'reason','amount');
  end if;
  select * into t from public.tenants where id=c.tenant_id for update;
  select * into p from public.billing_payments where mp_payment_id=p_payment_id for update;
  v_found := found;
  if v_found and p.checkout_id<>c.id then raise exception 'billing_payment_conflict'; end if;

  if p_status='approved' then
    if v_found and (p.period_end is not null or p.status in ('refunded','charged_back')) then
      return jsonb_build_object('ok',true,'applied',false,'activeUntil',t.plan_active_until);
    end if;
    if t.billing_mode=c.mode and t.plan_active_until>now() and t.plan<>c.plan then
      insert into public.billing_payments(mp_payment_id,tenant_id,checkout_id,mode,plan,annual,amount_cop,status,needs_review,raw)
        values(p_payment_id,c.tenant_id,c.id,c.mode,c.plan,c.annual,c.amount_cop,'approved',true,p_raw)
        on conflict(mp_payment_id) do update set status='approved',needs_review=true,raw=excluded.raw,updated_at=now();
      return jsonb_build_object('ok',false,'reason','plan_conflict');
    end if;
    v_start := case when t.billing_mode=c.mode and t.plan_active_until>now() then t.plan_active_until else now() end;
    v_end := v_start + case when c.annual then interval '12 months' else interval '1 month' end;
    insert into public.billing_payments(mp_payment_id,tenant_id,checkout_id,mode,plan,annual,amount_cop,status,period_start,period_end,raw)
      values(p_payment_id,c.tenant_id,c.id,c.mode,c.plan,c.annual,c.amount_cop,'approved',v_start,v_end,p_raw)
      on conflict(mp_payment_id) do update set status='approved',period_start=v_start,period_end=v_end,raw=excluded.raw,updated_at=now();
    update public.tenants set plan=c.plan,plan_period=case when c.annual then 'annual' else 'monthly' end,
      plan_paid_at=now(),plan_active_until=v_end,billing_mode=c.mode where id=t.id;
    update public.billing_checkouts set status='completed' where id=c.id and kind='one_time';
    return jsonb_build_object('ok',true,'applied',true,'plan',c.plan,'activeUntil',v_end);
  end if;

  if p_status in ('refunded','charged_back','cancelled') then
    if v_found and p.status='approved' and p.period_end is not null and p.period_end>now()
      and t.billing_mode=c.mode and t.plan_active_until is not null then
      update public.tenants set plan_active_until=plan_active_until-(p.period_end-greatest(p.period_start,now()))
        where id=t.id;
    end if;
    insert into public.billing_payments(mp_payment_id,tenant_id,checkout_id,mode,plan,annual,amount_cop,status,raw)
      values(p_payment_id,c.tenant_id,c.id,c.mode,c.plan,c.annual,c.amount_cop,p_status,p_raw)
      on conflict(mp_payment_id) do update set status=excluded.status,period_end=least(billing_payments.period_end,now()),
        raw=excluded.raw,updated_at=now();
    return jsonb_build_object('ok',true,'applied',false);
  end if;

  -- pending / in_process / rejected: record, but never downgrade a settled payment.
  insert into public.billing_payments(mp_payment_id,tenant_id,checkout_id,mode,plan,annual,amount_cop,status,raw)
    values(p_payment_id,c.tenant_id,c.id,c.mode,c.plan,c.annual,c.amount_cop,p_status,p_raw)
    on conflict(mp_payment_id) do update set status=excluded.status,raw=excluded.raw,updated_at=now()
    where billing_payments.status not in ('approved','refunded','charged_back','cancelled');
  return jsonb_build_object('ok',true,'applied',false,'status',p_status);
end; $$;

-- Records the automatic subscription (preapproval) linked to a checkout.
create function public.nexo_sync_mp_preapproval(p_checkout uuid,p_preapproval_id text,p_status text,p_mode text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare c public.billing_checkouts; t public.tenants;
begin
  if nullif(p_preapproval_id,'') is null or length(p_preapproval_id)>64 then raise exception 'billing_preapproval_invalid'; end if;
  select * into c from public.billing_checkouts where id=p_checkout and kind='subscription';
  if not found or c.mode<>p_mode then return jsonb_build_object('ok',false,'reason','checkout_unknown'); end if;
  if c.mp_ref is not null and c.mp_ref<>p_preapproval_id then return jsonb_build_object('ok',false,'reason','preapproval_mismatch'); end if;
  select * into t from public.tenants where id=c.tenant_id for update;
  -- Events of an older subscription never overwrite the one that is active.
  if t.mp_preapproval_id is not null and t.mp_preapproval_id<>p_preapproval_id and t.mp_preapproval_status='authorized' then
    return jsonb_build_object('ok',true,'applied',false);
  end if;
  update public.tenants set mp_preapproval_id=p_preapproval_id,mp_preapproval_status=p_status,billing_mode=coalesce(billing_mode,c.mode)
    where id=t.id;
  update public.billing_checkouts set mp_ref=p_preapproval_id,
    status=case when p_status='authorized' then 'completed' when p_status in ('cancelled','canceled') then 'canceled' else status end
    where id=c.id;
  return jsonb_build_object('ok',true,'applied',true);
end; $$;

revoke all on function public.nexo_claim_mp_checkout(uuid,uuid,text,text,text,boolean,bigint),
  public.nexo_apply_mp_payment(text,uuid,text,text,numeric,text,jsonb),
  public.nexo_sync_mp_preapproval(uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.nexo_claim_mp_checkout(uuid,uuid,text,text,text,boolean,bigint),
  public.nexo_apply_mp_payment(text,uuid,text,text,numeric,text,jsonb),
  public.nexo_sync_mp_preapproval(uuid,text,text,text) to service_role;

-- Paid tier while the period is current in the configured mode. Authorized automatic
-- subscriptions keep a 3-day grace while Mercado Pago retries the renewal charge.
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
    select case when t.plan_active_until is not null
      and t.billing_mode = (select mode from public.billing_settings where id=true)
      and t.plan_active_until + case when t.mp_preapproval_status='authorized' then interval '3 days' else interval '0 seconds' end > now()
      then t.plan else 'trial' end
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

drop function public.claim_billing_checkout(uuid,text,text,boolean);
drop table public.billing_accounts;
alter table public.tenants
  drop column stripe_customer_id,
  drop column stripe_subscription_id,
  drop column stripe_subscription_status,
  drop column stripe_current_period_end,
  drop column stripe_mode;
commit;
