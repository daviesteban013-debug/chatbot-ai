-- Opt-in, durable reminders for accepted orders awaiting payment. No LLM,
-- no proof-of-payment inference, and no automatic retry after an uncertain send.
create table public.nexo_sales_followup_settings (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  enabled boolean not null default false,
  enabled_at timestamptz,
  delay_minutes integer not null default 60 check (delay_minutes between 30 and 720),
  max_reminders integer not null default 1 check (max_reminders between 1 and 2),
  updated_at timestamptz not null default now()
);
create table public.nexo_sales_followups (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  basis_message_id uuid not null references public.messages(id) on delete cascade,
  reminder_no integer not null check (reminder_no between 1 and 2),
  due_at timestamptz not null,
  status text not null default 'queued' check (status in ('queued','claimed','sending','sent','canceled','blocked','unknown','failed')),
  reason text,
  lease_token uuid,
  lease_until timestamptz,
  wa_message_id text,
  dispatched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id,reminder_no)
);
create index nexo_sales_followups_due on public.nexo_sales_followups(due_at) where status='queued';
create index nexo_sales_followups_history on public.nexo_sales_followups(tenant_id,created_at desc);
create index nexo_sales_followups_conversation on public.nexo_sales_followups(conversation_id);
create index nexo_sales_followups_customer on public.nexo_sales_followups(customer_id);
create index nexo_sales_followups_basis on public.nexo_sales_followups(basis_message_id);
create index messages_confirmed_sales on public.messages((raw->>'nexo_confirmed_order'),created_at) where direction='inbound' and sender='customer' and raw ? 'nexo_confirmed_order';
create table public.nexo_sales_contact_preferences (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  stopped_at timestamptz not null default now(),
  source_message_id uuid not null references public.messages(id) on delete cascade,
  primary key(tenant_id,customer_id)
);
create index nexo_sales_contact_preferences_source on public.nexo_sales_contact_preferences(source_message_id);
create index nexo_sales_contact_preferences_customer on public.nexo_sales_contact_preferences(customer_id);
create table public.nexo_sales_worker_tickets (
  token_hash text primary key,
  expires_at timestamptz not null,
  consumed_at timestamptz
);
alter table public.nexo_sales_followup_settings enable row level security;
alter table public.nexo_sales_followups enable row level security;
alter table public.nexo_sales_contact_preferences enable row level security;
alter table public.nexo_sales_worker_tickets enable row level security;
create policy sales_followup_settings_read on public.nexo_sales_followup_settings for select to authenticated using (public.is_tenant_member(tenant_id));
create policy sales_followups_read on public.nexo_sales_followups for select to authenticated using (public.is_tenant_member(tenant_id));
create policy sales_contact_preferences_read on public.nexo_sales_contact_preferences for select to authenticated using (public.is_tenant_member(tenant_id));
revoke all on public.nexo_sales_followup_settings, public.nexo_sales_followups, public.nexo_sales_contact_preferences, public.nexo_sales_worker_tickets from public,anon,authenticated;
grant select on public.nexo_sales_followup_settings, public.nexo_sales_followups, public.nexo_sales_contact_preferences to authenticated;
grant all on public.nexo_sales_followup_settings, public.nexo_sales_followups, public.nexo_sales_contact_preferences, public.nexo_sales_worker_tickets to service_role;

create function public.nexo_configure_sales_followups(p_tenant uuid,p_user uuid,p_enabled boolean,p_delay integer,p_max integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
begin
  if not exists(select 1 from public.tenant_members where tenant_id=p_tenant and user_id=p_user and role='owner') then
    raise exception 'SALES_OWNER_REQUIRED';
  end if;
  if p_enabled is null or p_delay is null or p_delay not between 30 and 720 or p_max is null or p_max not between 1 and 2 then
    raise exception 'SALES_FOLLOWUP_INVALID';
  end if;
  insert into public.nexo_sales_followup_settings(tenant_id,enabled,enabled_at,delay_minutes,max_reminders)
    values(p_tenant,p_enabled,case when p_enabled then clock_timestamp() end,p_delay,p_max)
    on conflict(tenant_id) do update set enabled=excluded.enabled,
      enabled_at=case when excluded.enabled and not nexo_sales_followup_settings.enabled then clock_timestamp() else nexo_sales_followup_settings.enabled_at end,
      delay_minutes=excluded.delay_minutes,max_reminders=excluded.max_reminders,updated_at=clock_timestamp();
  if not p_enabled then
    update public.nexo_sales_followups set status='canceled',reason='followups_paused',updated_at=clock_timestamp()
      where tenant_id=p_tenant and status in ('queued','claimed');
  end if;
  return jsonb_build_object('enabled',p_enabled,'delay_minutes',p_delay,'max_reminders',p_max);
end $$;

create function public.nexo_cancel_sales_followup(p_tenant uuid,p_user uuid,p_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare job public.nexo_sales_followups;
begin
  if not exists(select 1 from public.tenant_members where tenant_id=p_tenant and user_id=p_user and role in ('owner','agent')) then
    raise exception 'SALES_MEMBER_REQUIRED';
  end if;
  select * into job from public.nexo_sales_followups where id=p_id and tenant_id=p_tenant for update;
  if not found then raise exception 'SALES_FOLLOWUP_NOT_FOUND'; end if;
  if job.status not in ('queued','claimed','canceled') then raise exception 'SALES_FOLLOWUP_ALREADY_DISPATCHED'; end if;
  update public.nexo_sales_followups set status='canceled',reason='canceled_by_user',updated_at=clock_timestamp()
    where order_id=job.order_id and tenant_id=p_tenant and status in ('queued','claimed');
  return jsonb_build_object('id',p_id,'status','canceled');
end $$;

-- Incoming messages cancel pending reminders immediately, including audio when
-- its transcript becomes available. The opt-out remains across conversations.
create function public.nexo_sales_incoming_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
declare cust uuid; txt text;
begin
  if new.direction <> 'inbound' or new.sender <> 'customer' then return new; end if;
  select customer_id into cust from public.conversations where id=new.conversation_id and tenant_id=new.tenant_id;
  if cust is null then return new; end if;
  txt:=translate(lower(coalesce(nullif(new.transcript,''),new.body,'')),'áéíóúüñ','aeiouun');
  if txt ~ '(no me (escribas|contactes|envies|mandes)|deja de (escribirme|contactarme|enviarme)|no quiero (mas )?(mensajes|recordatorios))' then
    insert into public.nexo_sales_contact_preferences(tenant_id,customer_id,source_message_id)
      values(new.tenant_id,cust,new.id) on conflict(tenant_id,customer_id) do update set stopped_at=clock_timestamp(),source_message_id=excluded.source_message_id;
    update public.nexo_sales_followups set status='canceled',reason='customer_opted_out',updated_at=clock_timestamp()
      where tenant_id=new.tenant_id and customer_id=cust and status in ('queued','claimed');
  end if;
  update public.nexo_sales_followups set status='canceled',reason='customer_replied',updated_at=clock_timestamp()
    where tenant_id=new.tenant_id and conversation_id=new.conversation_id and basis_message_id<>new.id and status in ('queued','claimed');
  return new;
end $$;
create trigger nexo_sales_incoming_guard after insert or update of body,transcript on public.messages
for each row execute function public.nexo_sales_incoming_guard();

-- One shared eligibility check is used at claim AND immediately before sending.
create function public.nexo_sales_followup_block_reason(p_id uuid) returns text
language plpgsql security invoker set search_path='' as $$
declare j public.nexo_sales_followups; o public.orders; c public.conversations; basis public.messages;
  settings public.nexo_sales_followup_settings; rules jsonb; last_in uuid;
begin
  select * into j from public.nexo_sales_followups where id=p_id;
  if not found then return 'order_no_longer_pending'; end if;
  select * into settings from public.nexo_sales_followup_settings where tenant_id=j.tenant_id;
  if not found or not settings.enabled or j.reminder_no>settings.max_reminders then return 'followups_paused'; end if;
  if not exists(select 1 from public.tenants where id=j.tenant_id and status='active') then return 'autonomy_disabled'; end if;
  select business_rules into rules from public.agents where tenant_id=j.tenant_id and active order by updated_at desc limit 1;
  if not found or (select mode from public.agents where tenant_id=j.tenant_id and active order by updated_at desc limit 1) <> 'autonomous' then return 'autonomy_disabled'; end if;
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

create function public.nexo_enqueue_sales_followups() returns integer
language plpgsql security invoker set search_path='' as $$
declare added integer;
begin
  -- A lease may be retried only while no external request has started.
  update public.nexo_sales_followups set status='queued',lease_token=null,lease_until=null,reason='lease_expired',updated_at=clock_timestamp()
    where status='claimed' and lease_until<clock_timestamp();
  update public.nexo_sales_followups set status='unknown',reason='delivery_uncertain',updated_at=clock_timestamp()
    where status='sending' and lease_until<clock_timestamp();
  insert into public.nexo_sales_followups(tenant_id,conversation_id,customer_id,order_id,basis_message_id,reminder_no,due_at)
  select o.tenant_id,o.conversation_id,o.customer_id,o.id,m.id,n,
    case when n=1 then m.created_at+make_interval(mins=>s.delay_minutes) else prior.updated_at+make_interval(mins=>s.delay_minutes) end
  from public.orders o
  join public.nexo_sales_followup_settings s on s.tenant_id=o.tenant_id and s.enabled
  join public.messages m on m.tenant_id=o.tenant_id and m.conversation_id=o.conversation_id and m.raw->>'nexo_confirmed_order'=o.id::text
    and m.direction='inbound' and m.sender='customer'
  cross join lateral generate_series(1,s.max_reminders) n
  left join public.nexo_sales_followups prior on prior.order_id=o.id and prior.reminder_no=1
  where o.status='pending_payment' and o.payment_status='pending' and o.payment_method in ('enlace','transferencia')
    and m.created_at>=s.enabled_at and m.created_at>clock_timestamp()-interval '23 hours 59 minutes' and m.created_at<=clock_timestamp()
    and (n=1 or prior.status='sent')
    and exists(select 1 from public.messages reply where reply.tenant_id=o.tenant_id and reply.conversation_id=o.conversation_id
      and reply.direction='outbound' and reply.sender='agent' and reply.raw->>'nexo_sale'='order_confirmed' and reply.raw->>'order_id'=o.id::text and reply.created_at>=m.created_at)
  on conflict(order_id,reminder_no) do nothing;
  get diagnostics added=row_count;
  update public.nexo_sales_followups j set status='canceled',reason=public.nexo_sales_followup_block_reason(j.id),updated_at=clock_timestamp()
    where j.status in ('queued','claimed') and public.nexo_sales_followup_block_reason(j.id) is not null;
  return added;
end $$;

create function public.nexo_claim_sales_followups(p_limit integer default 3) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare j public.nexo_sales_followups; result jsonb:='[]'::jsonb; token uuid;
begin
  perform public.nexo_enqueue_sales_followups();
  for j in select * from public.nexo_sales_followups where status='queued' and due_at<=clock_timestamp() order by due_at for update skip locked limit greatest(1,least(coalesce(p_limit,3),3)) loop
    token:=gen_random_uuid();
    update public.nexo_sales_followups set status='claimed',lease_token=token,lease_until=clock_timestamp()+interval '2 minutes',updated_at=clock_timestamp() where id=j.id;
    result:=result||jsonb_build_array(jsonb_build_object('id',j.id,'tenant_id',j.tenant_id,'lease_token',token));
  end loop;
  return result;
end $$;

create function public.nexo_begin_sales_followup(p_id uuid,p_lease uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare j public.nexo_sales_followups; v_reason text; basis jsonb; phone text;
begin
  select * into j from public.nexo_sales_followups where id=p_id;
  if not found then return jsonb_build_object('ready',false,'reason','lease_expired'); end if;
  -- The same lock order as message/order writers avoids job/conversation cycles.
  perform 1 from public.conversations where id=j.conversation_id for update;
  perform 1 from public.orders where id=j.order_id for update;
  select * into j from public.nexo_sales_followups where id=p_id for update;
  if not found or j.status<>'claimed' or p_lease is null or j.lease_token is distinct from p_lease or j.lease_until<=clock_timestamp() then return jsonb_build_object('ready',false,'reason','lease_expired'); end if;
  v_reason:=public.nexo_sales_followup_block_reason(j.id);
  if v_reason is not null then
    update public.nexo_sales_followups set status='canceled',reason=v_reason,updated_at=clock_timestamp() where id=p_id;
    return jsonb_build_object('ready',false,'reason',v_reason);
  end if;
  select raw->'nexo_accepted_snapshot' into basis from public.messages where id=j.basis_message_id;
  select customers.phone into phone from public.customers where id=j.customer_id and tenant_id=j.tenant_id;
  if phone is null or phone !~ '^\+?[0-9]{8,15}$' then
    update public.nexo_sales_followups set status='blocked',reason='credentials_unavailable',updated_at=clock_timestamp() where id=p_id;
    return jsonb_build_object('ready',false,'reason','credentials_unavailable');
  end if;
  update public.nexo_sales_followups set status='sending',dispatched_at=clock_timestamp(),updated_at=clock_timestamp() where id=p_id;
  return jsonb_build_object('ready',true,'tenant_id',j.tenant_id,'phone',ltrim(phone,'+'),'order_id',j.order_id,'total',(basis->>'total')::integer,'payment_instructions',basis->'payment_instructions','reminder_no',j.reminder_no);
end $$;

create function public.nexo_finish_sales_followup(p_id uuid,p_lease uuid,p_status text,p_reason text default null,p_wa_message_id text default null,p_body text default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare j public.nexo_sales_followups;
begin
  select * into j from public.nexo_sales_followups where id=p_id;
  if not found then raise exception 'SALES_FOLLOWUP_NOT_FOUND'; end if;
  perform 1 from public.conversations where id=j.conversation_id for update;
  perform 1 from public.orders where id=j.order_id for update;
  select * into j from public.nexo_sales_followups where id=p_id for update;
  if not found or p_lease is null or j.lease_token is distinct from p_lease then raise exception 'SALES_FOLLOWUP_NOT_FOUND'; end if;
  if j.status='sent' then return jsonb_build_object('status','sent'); end if;
  if not (j.status='sending' and p_status in ('sent','unknown','failed','blocked') or j.status='claimed' and p_status='blocked') then raise exception 'SALES_FOLLOWUP_INVALID'; end if;
  if p_reason is not null and p_reason not in ('credentials_unavailable','delivery_uncertain','provider_rejected','rate_limited','invalid_snapshot','message_too_long','channel_not_configured','provider_response_invalid') then raise exception 'SALES_FOLLOWUP_INVALID'; end if;
  if p_status='sent' then
    if nullif(p_wa_message_id,'') is null or length(p_wa_message_id)>300 or nullif(p_body,'') is null or length(p_body)>4096 then raise exception 'SALES_FOLLOWUP_INVALID'; end if;
    insert into public.messages(tenant_id,conversation_id,direction,sender,type,body,wa_message_id,raw)
      values(j.tenant_id,j.conversation_id,'outbound','agent','text',p_body,p_wa_message_id,jsonb_build_object('nexo_sale','payment_followup','order_id',j.order_id,'followup_id',j.id));
    update public.conversations set last_message_at=clock_timestamp() where id=j.conversation_id and tenant_id=j.tenant_id;
  end if;
  update public.nexo_sales_followups set status=p_status,reason=p_reason,wa_message_id=p_wa_message_id,updated_at=clock_timestamp() where id=p_id;
  return jsonb_build_object('status',p_status);
end $$;

create function public.nexo_consume_sales_worker_ticket(p_token uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
declare consumed text;
begin
  update public.nexo_sales_worker_tickets set consumed_at=clock_timestamp()
    where token_hash=encode(sha256(convert_to(p_token::text,'UTF8')),'hex') and consumed_at is null and expires_at>clock_timestamp()
    returning token_hash into consumed;
  return consumed is not null;
end $$;

-- pg_net sends after commit. Each request carries a short-lived, one-use ticket;
-- neither a reusable token nor a new environment secret is needed.
create function public.nexo_dispatch_sales_followup_worker() returns void
language plpgsql security invoker set search_path='' as $$
declare token uuid;
begin
  perform public.nexo_enqueue_sales_followups();
  delete from public.nexo_sales_worker_tickets where expires_at<clock_timestamp()-interval '1 day';
  if not exists(select 1 from public.nexo_sales_followups where status='queued' and due_at<=clock_timestamp()) then return; end if;
  token:=gen_random_uuid();
  insert into public.nexo_sales_worker_tickets(token_hash,expires_at) values(encode(sha256(convert_to(token::text,'UTF8')),'hex'),clock_timestamp()+interval '2 minutes');
  perform net.http_post(url:='https://chatbot-ai-gold-two.vercel.app/api/whatsapp/followups',body:=jsonb_build_object('token',token),headers:='{"Content-Type":"application/json"}'::jsonb,timeout_milliseconds:=55000);
end $$;

revoke all on function public.nexo_configure_sales_followups(uuid,uuid,boolean,integer,integer), public.nexo_cancel_sales_followup(uuid,uuid,uuid), public.nexo_sales_incoming_guard(), public.nexo_sales_followup_block_reason(uuid), public.nexo_enqueue_sales_followups(), public.nexo_claim_sales_followups(integer), public.nexo_begin_sales_followup(uuid,uuid), public.nexo_finish_sales_followup(uuid,uuid,text,text,text,text), public.nexo_consume_sales_worker_ticket(uuid), public.nexo_dispatch_sales_followup_worker() from public,anon,authenticated;
grant execute on function public.nexo_configure_sales_followups(uuid,uuid,boolean,integer,integer), public.nexo_cancel_sales_followup(uuid,uuid,uuid), public.nexo_sales_incoming_guard(), public.nexo_sales_followup_block_reason(uuid), public.nexo_enqueue_sales_followups(), public.nexo_claim_sales_followups(integer), public.nexo_begin_sales_followup(uuid,uuid), public.nexo_finish_sales_followup(uuid,uuid,text,text,text,text), public.nexo_consume_sales_worker_ticket(uuid), public.nexo_dispatch_sales_followup_worker() to service_role;

do $$ begin
  if exists(select 1 from pg_available_extensions where name='pg_net') then
    execute 'create extension if not exists pg_net with schema extensions';
  end if;
  if exists(select 1 from pg_extension where extname='pg_cron') and exists(select 1 from pg_extension where extname='pg_net') then
    perform cron.schedule('nexo-sales-followups','*/5 * * * *','select public.nexo_dispatch_sales_followup_worker()');
  end if;
end $$;
