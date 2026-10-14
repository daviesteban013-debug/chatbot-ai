begin;
-- Results dashboard: what NEXO sold, collected and recovered for the business.
-- Read-only, computed on the server for any member (owner, agent or viewer).

-- "Closed" = the customer confirmed the order (it may still be unpaid).
create function public.nexo_sales_window(p_tenant uuid, p_from timestamptz, p_to timestamptz)
returns jsonb language sql stable security invoker set search_path='' as $$
  with closed as (
    select o.id, o.conversation_id, o.total, o.payment_status::text as payment, o.created_by::text as created_by
    from public.orders o
    where o.tenant_id=p_tenant and o.created_at >= p_from and o.created_at < p_to
      and o.status::text in ('pending_payment','confirmed','shipped','delivered')
  ), chats as (
    select distinct m.conversation_id from public.messages m
    where m.tenant_id=p_tenant and m.direction='inbound' and m.sender='customer' and m.created_at >= p_from and m.created_at < p_to
  )
  select jsonb_build_object(
    'conversations', (select count(*) from chats),
    'converted', (select count(distinct c.conversation_id) from closed c join chats using (conversation_id)),
    'orders', (select count(*) from closed),
    'sales', (select coalesce(sum(total),0) from closed),
    'agentOrders', (select count(*) from closed where created_by='agent'),
    'agentSales', (select coalesce(sum(total),0) from closed where created_by='agent'),
    'paidOrders', (select count(*) from closed where payment='paid'),
    'collected', (select coalesce(sum(total),0) from closed where payment='paid'),
    'recoveredOrders', (select count(*) from closed c where c.payment='paid'
      and exists(select 1 from public.nexo_sales_followups f where f.order_id=c.id and f.status='sent')),
    'recovered', (select coalesce(sum(total),0) from closed c where c.payment='paid'
      and exists(select 1 from public.nexo_sales_followups f where f.order_id=c.id and f.status='sent')),
    'handoffs', (select count(distinct h.conversation_id) from public.handoffs h
      where h.tenant_id=p_tenant and h.created_at >= p_from and h.created_at < p_to),
    'avgReplyMs', (select round(avg(r.latency_ms)) from public.agent_runs r
      where r.tenant_id=p_tenant and r.status='sent' and r.created_at >= p_from and r.created_at < p_to)
  );
$$;

create function public.nexo_sales_metrics(p_tenant uuid, p_user uuid, p_days integer)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare v_today timestamptz; v_since timestamptz; v_prev timestamptz;
begin
  if p_days not in (7,30,90) then raise exception 'metrics_invalid'; end if;
  if not exists(select 1 from public.tenant_members where tenant_id=p_tenant and user_id=p_user) then raise exception 'metrics_forbidden'; end if;
  -- Calendar days in Colombia, today included.
  v_today := date_trunc('day', now() at time zone 'America/Bogota') at time zone 'America/Bogota';
  v_since := v_today - make_interval(days => p_days - 1);
  v_prev := v_since - make_interval(days => p_days);
  return jsonb_build_object(
    'days', p_days, 'since', v_since,
    'current', public.nexo_sales_window(p_tenant, v_since, now()),
    'previous', public.nexo_sales_window(p_tenant, v_prev, v_since),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object('day', to_char(d.day,'YYYY-MM-DD'), 'orders', coalesce(x.orders,0), 'sales', coalesce(x.sales,0)) order by d.day), '[]'::jsonb)
      from generate_series((v_since at time zone 'America/Bogota')::date, (v_today at time zone 'America/Bogota')::date, interval '1 day') as d(day)
      left join (
        select (o.created_at at time zone 'America/Bogota')::date as day, count(*) as orders, sum(o.total) as sales
        from public.orders o
        where o.tenant_id=p_tenant and o.created_at >= v_since
          and o.status::text in ('pending_payment','confirmed','shipped','delivered')
        group by 1
      ) x on x.day = d.day::date),
    'topProducts', (select coalesce(jsonb_agg(t order by t.qty desc, t.sales desc), '[]'::jsonb) from (
      select i.name_snapshot as name, sum(i.qty)::integer as qty, sum(i.qty * i.unit_price)::bigint as sales
      from public.order_items i join public.orders o on o.id=i.order_id
      where o.tenant_id=p_tenant and o.created_at >= v_since
        and o.status::text in ('pending_payment','confirmed','shipped','delivered')
      group by i.name_snapshot order by 2 desc, 3 desc limit 5) t)
  );
end; $$;

revoke all on function public.nexo_sales_window(uuid,timestamptz,timestamptz), public.nexo_sales_metrics(uuid,uuid,integer) from public, anon, authenticated;
grant execute on function public.nexo_sales_window(uuid,timestamptz,timestamptz), public.nexo_sales_metrics(uuid,uuid,integer) to service_role;
commit;
