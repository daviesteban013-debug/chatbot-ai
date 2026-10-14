begin;
-- What is happening in the business right now, for NEXO's proactive alerts in the bubble.
-- Read-only and deterministic (no model, no credits). The client keeps what it already
-- announced, so the same event is never announced twice.
create function public.nexo_pulse(p_tenant uuid, p_user uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin
  if not exists(select 1 from public.tenant_members where tenant_id=p_tenant and user_id=p_user) then raise exception 'PULSE_FORBIDDEN'; end if;
  return jsonb_build_object(
    'at', now(),
    'handoffs', coalesce((select jsonb_agg(x) from (
        select h.id, h.created_at as at, coalesce(nullif(c.name,''), c.phone) as customer
        from public.handoffs h join public.conversations cv on cv.id=h.conversation_id join public.customers c on c.id=cv.customer_id
        where h.tenant_id=p_tenant and h.status='open' order by h.created_at desc limit 20) x), '[]'::jsonb),
    'approvals', coalesce((select jsonb_agg(x) from (
        select o.id, o.created_at as at, coalesce(nullif(c.name,''), c.phone) as customer, o.total
        from public.orders o join public.customers c on c.id=o.customer_id
        where o.tenant_id=p_tenant and o.status='pending_approval' order by o.created_at desc limit 20) x), '[]'::jsonb),
    'payments', coalesce((select jsonb_agg(x) from (
        select o.id, o.updated_at as at, coalesce(nullif(c.name,''), c.phone) as customer, o.total
        from public.orders o join public.customers c on c.id=o.customer_id
        where o.tenant_id=p_tenant and o.payment_status='paid' and o.updated_at > now() - interval '24 hours'
        order by o.updated_at desc limit 20) x), '[]'::jsonb),
    'sales', coalesce((select jsonb_agg(x) from (
        select o.id, o.created_at as at, coalesce(nullif(c.name,''), c.phone) as customer, o.total
        from public.orders o join public.customers c on c.id=o.customer_id
        where o.tenant_id=p_tenant and o.created_by='agent' and o.status::text in ('pending_payment','confirmed','shipped','delivered')
          and o.created_at > now() - interval '24 hours'
        order by o.created_at desc limit 20) x), '[]'::jsonb),
    'stockouts', coalesce((select jsonb_agg(x) from (
        select v.id, concat_ws(' · ', p.name, v.color, v.size) as label
        from public.product_variants v join public.products p on p.id=v.product_id
        where v.tenant_id=p_tenant and v.active and p.active and v.stock_qty - v.reserved_qty <= 0
        order by p.name, v.sku limit 20) x), '[]'::jsonb),
    'tasks', coalesce((select jsonb_agg(x) from (
        select w.id, w.title, w.due_at
        from public.nexo_work_items w
        where w.tenant_id=p_tenant and w.kind='task' and w.status='active' and w.due_at <= now()
          and coalesce(w.assignee_id, w.created_by)=p_user
        order by w.due_at desc limit 20) x), '[]'::jsonb)
  );
end; $$;
revoke all on function public.nexo_pulse(uuid,uuid) from public, anon, authenticated;
grant execute on function public.nexo_pulse(uuid,uuid) to service_role;
commit;
