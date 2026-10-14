begin;
-- Reliability fixes from the code review: stale credit reservations, duplicate business
-- provisioning and concurrent decisions on orders waiting for approval.

-- 1. A model call that fails after the provider accepted it leaves its reservation
-- pending. Calls time out in under a minute, so a reservation older than 15 minutes
-- will never be settled: release it instead of blocking the monthly allowance.
create function public.nexo_expire_credit_reservations()
returns integer language plpgsql security invoker set search_path='' as $$
declare r record; n integer := 0;
begin
  for r in select id from public.credit_requests where state='reserved' and created_at < now() - interval '15 minutes'
    order by created_at limit 1000 for update skip locked loop
    perform public.release_credits(r.id);
    n := n + 1;
  end loop;
  return n;
end; $$;
revoke all on function public.nexo_expire_credit_reservations() from public, anon, authenticated;
grant execute on function public.nexo_expire_credit_reservations() to service_role;

-- 2. Creating the business on signup can run twice at once (callback + finish page,
-- double submit). A per-user lock makes it idempotent: one business per new owner.
create function public.nexo_provision_tenant(p_user uuid, p_name text, p_slug text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare v_tenant uuid;
begin
  if p_user is null or nullif(trim(p_name),'') is null or nullif(trim(p_slug),'') is null then raise exception 'tenant_invalid'; end if;
  perform pg_advisory_xact_lock(hashtextextended('nexo-provision:' || p_user::text, 0));
  select m.tenant_id into v_tenant from public.tenant_members m join public.tenants t on t.id=m.tenant_id
    where m.user_id=p_user order by (m.role='owner') desc, t.created_at, t.id limit 1;
  if found then return v_tenant; end if;
  insert into public.tenants(name,slug,plan) values(left(trim(p_name),60),p_slug,'pilot') returning id into v_tenant;
  insert into public.tenant_members(tenant_id,user_id,role) values(v_tenant,p_user,'owner');
  return v_tenant;
end; $$;
revoke all on function public.nexo_provision_tenant(uuid,text,text) from public, anon, authenticated;
grant execute on function public.nexo_provision_tenant(uuid,text,text) to service_role;

-- 3. Approve or reject an order waiting for approval exactly once. The order row lock
-- serializes double clicks and approve/reject races; stock is released only once.
create function public.nexo_review_pending_order(p_tenant uuid, p_user uuid, p_order uuid, p_approve boolean)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_status text; item record;
begin
  perform 1 from public.tenant_members where tenant_id=p_tenant and user_id=p_user and role in ('owner','agent') for share;
  if not found then raise exception 'order_forbidden'; end if;
  select status::text into v_status from public.orders where id=p_order and tenant_id=p_tenant for update;
  if not found then return jsonb_build_object('ok',false,'reason','not_found'); end if;
  if v_status <> 'pending_approval' then return jsonb_build_object('ok',false,'reason','processed'); end if;
  if p_approve then
    update public.orders set status='pending_payment', updated_at=now() where id=p_order;
  else
    for item in select variant_id, qty from public.order_items where order_id=p_order and tenant_id=p_tenant loop
      update public.product_variants set reserved_qty=greatest(reserved_qty-item.qty,0)
        where id=item.variant_id and tenant_id=p_tenant;
    end loop;
    update public.orders set status='canceled', updated_at=now() where id=p_order;
  end if;
  return jsonb_build_object('ok',true,'status',case when p_approve then 'pending_payment' else 'canceled' end);
end; $$;
revoke all on function public.nexo_review_pending_order(uuid,uuid,uuid,boolean) from public, anon, authenticated;
grant execute on function public.nexo_review_pending_order(uuid,uuid,uuid,boolean) to service_role;

-- Local PostgreSQL test runtimes may not ship pg_cron; production Supabase does.
do $$ begin
  if exists(select 1 from pg_available_extensions where name='pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('nexo-expire-credit-reservations','*/5 * * * *','select public.nexo_expire_credit_reservations()');
  end if;
end $$;
commit;
