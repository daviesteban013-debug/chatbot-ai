-- Match the active agent used by the conversation loop, dashboard and sales RPCs.
create or replace function public.nexo_sales_followup_block_reason(p_id uuid) returns text
language plpgsql security invoker set search_path='' as $$
declare j public.nexo_sales_followups; o public.orders; c public.conversations; basis public.messages;
  settings public.nexo_sales_followup_settings; rules jsonb; last_in uuid; selected_mode public.agent_mode;
begin
  select * into j from public.nexo_sales_followups where id=p_id;
  if not found then return 'order_no_longer_pending'; end if;
  select * into settings from public.nexo_sales_followup_settings where tenant_id=j.tenant_id;
  if not found or not settings.enabled or j.reminder_no>settings.max_reminders then return 'followups_paused'; end if;
  if not exists(select 1 from public.tenants where id=j.tenant_id and status='active') then return 'autonomy_disabled'; end if;
  select business_rules,mode into rules,selected_mode from public.agents where tenant_id=j.tenant_id and active order by created_at desc limit 1;
  if not found or selected_mode is distinct from 'autonomous'::public.agent_mode then return 'autonomy_disabled'; end if;
  select * into c from public.conversations where id=j.conversation_id and tenant_id=j.tenant_id and customer_id=j.customer_id;
  if not found or c.status<>'open' or c.assigned_to is not null or exists(select 1 from public.handoffs where tenant_id=j.tenant_id and conversation_id=j.conversation_id and status in ('open','taken')) then return 'conversation_unavailable'; end if;
  select * into o from public.orders where id=j.order_id and tenant_id=j.tenant_id and conversation_id=j.conversation_id and customer_id=j.customer_id;
  if not found or o.status<>'pending_payment' or o.payment_status<>'pending' then return 'order_no_longer_pending'; end if;
  select * into basis from public.messages where id=j.basis_message_id and tenant_id=j.tenant_id and conversation_id=j.conversation_id and direction='inbound' and sender='customer';
  if not found or basis.raw->>'nexo_confirmed_order' is distinct from j.order_id::text then return 'order_no_longer_pending'; end if;
  if basis.created_at>clock_timestamp() or basis.created_at<=clock_timestamp()-interval '23 hours 59 minutes' then return 'service_window_closed'; end if;
  select id into last_in from public.messages where tenant_id=j.tenant_id and conversation_id=j.conversation_id and direction='inbound' and sender='customer' order by created_at desc,id desc limit 1;
  if last_in is distinct from basis.id then return 'customer_replied'; end if;
  if exists(select 1 from public.messages where tenant_id=j.tenant_id and conversation_id=j.conversation_id and direction='outbound' and sender='human' and created_at>=basis.created_at) then return 'conversation_unavailable'; end if;
  if exists(select 1 from public.nexo_sales_contact_preferences where tenant_id=j.tenant_id and customer_id=j.customer_id) then return 'customer_opted_out'; end if;
  if (basis.raw->'nexo_accepted_snapshot'->>'total') is distinct from o.total::text
     or (basis.raw->'nexo_accepted_snapshot'->'payment_instructions'->>'version') is distinct from (rules->'sales_payments'->>'version')
     or (basis.raw->'nexo_accepted_snapshot'->'payment_instructions'->>'version') is null
     or o.payment_method not in ('enlace','transferencia') then return 'payment_terms_changed'; end if;
  if j.reminder_no=2 and not exists(select 1 from public.nexo_sales_followups prior where prior.order_id=j.order_id and prior.reminder_no=1 and prior.status='sent') then return 'previous_reminder_unavailable'; end if;
  return null;
end $$;
