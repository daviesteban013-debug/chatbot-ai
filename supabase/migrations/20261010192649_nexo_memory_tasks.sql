-- Human-reviewed business/customer memory and durable internal CRM reminders.
create table public.nexo_work_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  kind text not null check (kind in ('memory','task')),
  title text not null check (length(btrim(title)) between 1 and 160),
  body text not null default '' check (length(body)<=4000),
  customer_id uuid references public.customers(id) on delete cascade,
  assignee_id uuid references auth.users(id) on delete set null,
  due_at timestamptz,
  timezone text not null default 'America/Bogota',
  status text not null default 'proposed' check (status in ('proposed','active','done','canceled')),
  created_by uuid not null references auth.users(id),
  confirmed_by uuid references auth.users(id),
  source_session text references public.jarvis_sessions(session_id) on delete set null,
  request_key uuid not null,
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '24 hours',
  check ((kind='memory' and due_at is null and assignee_id is null and status<>'done') or (kind='task' and due_at is not null)),
  unique(tenant_id,created_by,request_key)
);
create index nexo_work_tenant_kind on public.nexo_work_items(tenant_id,kind,status,updated_at desc);
create index nexo_work_customer on public.nexo_work_items(customer_id);
create index nexo_work_assignee on public.nexo_work_items(assignee_id);
create index nexo_work_creator on public.nexo_work_items(created_by);
create index nexo_work_confirmer on public.nexo_work_items(confirmed_by);
create index nexo_work_session on public.nexo_work_items(source_session);
create index nexo_work_due on public.nexo_work_items(due_at) where kind='task' and status='active';

create table public.nexo_work_events (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  item_id uuid not null,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  revision integer not null,
  created_at timestamptz not null default now()
);
create index nexo_work_events_tenant on public.nexo_work_events(tenant_id,created_at desc);
create index nexo_work_events_actor on public.nexo_work_events(actor_id);

create table public.nexo_task_reminders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  item_id uuid not null references public.nexo_work_items(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  due_at timestamptz not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  unique(item_id,user_id,due_at)
);
create index nexo_reminders_user on public.nexo_task_reminders(user_id,tenant_id,created_at desc);
create index nexo_reminders_tenant on public.nexo_task_reminders(tenant_id);

alter table public.nexo_work_items enable row level security;
alter table public.nexo_work_events enable row level security;
alter table public.nexo_task_reminders enable row level security;
revoke all on public.nexo_work_items,public.nexo_work_events,public.nexo_task_reminders from public,anon,authenticated;
grant select on public.nexo_work_items,public.nexo_work_events,public.nexo_task_reminders to authenticated;
grant all on public.nexo_work_items,public.nexo_work_events,public.nexo_task_reminders to service_role;
grant usage,select on sequence public.nexo_work_events_id_seq to service_role;
create policy nexo_work_read on public.nexo_work_items for select to authenticated using (
  exists(select 1 from public.tenant_members m where m.tenant_id=nexo_work_items.tenant_id and m.user_id=(select auth.uid()))
  and (status<>'proposed' or created_by=(select auth.uid()))
);
create policy nexo_work_events_read on public.nexo_work_events for select to authenticated using (
  exists(select 1 from public.tenant_members m where m.tenant_id=nexo_work_events.tenant_id and m.user_id=(select auth.uid()) and m.role in ('owner','agent'))
);
create policy nexo_reminders_read on public.nexo_task_reminders for select to authenticated using (
  user_id=(select auth.uid()) and exists(select 1 from public.tenant_members m where m.tenant_id=nexo_task_reminders.tenant_id and m.user_id=(select auth.uid()))
);

create function public.nexo_propose_work(p_tenant uuid,p_user uuid,p_session text,p_key uuid,p_input jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare w public.nexo_work_items%rowtype; k text; c uuid; a uuid; d timestamptz; tz text;
begin
  perform 1 from public.tenant_members where tenant_id=p_tenant and user_id=p_user and role in ('owner','agent') for share;
  if not found then raise exception 'NEXO_FORBIDDEN'; end if;
  if p_session is not null then
    perform 1 from public.jarvis_sessions where session_id=p_session and tenant_id=p_tenant and user_id=p_user for share;
    if not found then raise exception 'NEXO_FORBIDDEN'; end if;
  end if;
  if p_key is null or jsonb_typeof(p_input)<>'object' or p_input is null then raise exception 'NEXO_INPUT'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_tenant::text||p_user::text,0));
  select * into w from public.nexo_work_items where tenant_id=p_tenant and created_by=p_user and request_key=p_key;
  if found then return to_jsonb(w); end if;
  if (select count(*) from public.nexo_work_items where tenant_id=p_tenant and created_by=p_user and status='proposed' and expires_at>now())>=30 then raise exception 'NEXO_LIMIT'; end if;
  k=p_input->>'kind'; c=nullif(p_input->>'customer_id','')::uuid;
  a=nullif(p_input->>'assignee_id','')::uuid; tz=coalesce(p_input->>'timezone','America/Bogota');
  if k not in ('memory','task') or k is null or coalesce(length(btrim(p_input->>'title')),0) not between 1 and 160
    or length(coalesce(p_input->>'body',''))>4000 or not exists(select 1 from pg_timezone_names where name=tz) then raise exception 'NEXO_INPUT'; end if;
  if c is not null then
    perform 1 from public.customers where id=c and tenant_id=p_tenant for share;
    if not found then raise exception 'NEXO_CUSTOMER'; end if;
  end if;
  if k='task' then
    d=(p_input->>'due_at')::timestamptz; a=coalesce(a,p_user);
    if d is null or not isfinite(d) or d<=now() or d>now()+interval '2 years' then raise exception 'NEXO_DATE'; end if;
    perform 1 from public.tenant_members where tenant_id=p_tenant and user_id=a for share;
    if not found then raise exception 'NEXO_ASSIGNEE'; end if;
  elsif a is not null or p_input->>'due_at' is not null then raise exception 'NEXO_INPUT'; end if;
  insert into public.nexo_work_items(tenant_id,kind,title,body,customer_id,assignee_id,due_at,timezone,created_by,source_session,request_key)
    values(p_tenant,k,btrim(p_input->>'title'),coalesce(p_input->>'body',''),c,a,d,tz,p_user,p_session,p_key) returning * into w;
  insert into public.nexo_work_events(tenant_id,item_id,actor_id,action,revision) values(p_tenant,w.id,p_user,'proposed',w.revision);
  return to_jsonb(w);
end $$;
revoke all on function public.nexo_propose_work(uuid,uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.nexo_propose_work(uuid,uuid,text,uuid,jsonb) to service_role;

-- Separate human-click endpoint calls this RPC; it is never an LLM tool.
create function public.nexo_change_work(p_tenant uuid,p_user uuid,p_id uuid,p_revision integer,p_action text,p_patch jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare w public.nexo_work_items%rowtype; d timestamptz; tz text; a uuid;
begin
  perform 1 from public.tenant_members where tenant_id=p_tenant and user_id=p_user and role in ('owner','agent') for share;
  if not found then raise exception 'NEXO_FORBIDDEN'; end if;
  select * into w from public.nexo_work_items where id=p_id and tenant_id=p_tenant for update;
  if not found or (w.status='proposed' and w.created_by<>p_user) then raise exception 'NEXO_FORBIDDEN'; end if;
  if p_action='confirm' and w.status='active' then return to_jsonb(w); end if;
  if p_revision is null or w.revision<>p_revision then raise exception 'NEXO_CONFLICT'; end if;
  if p_action='confirm' then
    if w.status<>'proposed' or w.expires_at<=now() then raise exception 'NEXO_EXPIRED'; end if;
    if w.kind='task' then
      if w.due_at<=now() then raise exception 'NEXO_DATE'; end if;
      perform 1 from public.tenant_members where tenant_id=p_tenant and user_id=w.assignee_id for share;
      if not found then raise exception 'NEXO_ASSIGNEE'; end if;
    end if;
    w.status='active'; w.confirmed_by=p_user;
  elsif p_action='complete' and w.kind='task' and w.status='active' then w.status='done';
  elsif p_action='cancel' and w.status in ('proposed','active') then w.status='canceled';
  elsif p_action='edit' and w.status='active' then
    if p_patch is null or jsonb_typeof(p_patch)<>'object' or coalesce(length(btrim(p_patch->>'title')),0) not between 1 and 160
      or length(coalesce(p_patch->>'body',''))>4000 then raise exception 'NEXO_INPUT'; end if;
    w.title=btrim(p_patch->>'title'); w.body=coalesce(p_patch->>'body','');
    if w.kind='task' then
      d=(p_patch->>'due_at')::timestamptz; tz=p_patch->>'timezone';
      if d is null or not isfinite(d) or d<=now() or d>now()+interval '2 years' or not exists(select 1 from pg_timezone_names where name=tz) then raise exception 'NEXO_DATE'; end if;
      w.due_at=d; w.timezone=tz;
      a=coalesce(nullif(p_patch->>'assignee_id','')::uuid,w.assignee_id,w.created_by);
      perform 1 from public.tenant_members where tenant_id=p_tenant and user_id=a for share;
      if not found then raise exception 'NEXO_ASSIGNEE'; end if;
      w.assignee_id=a;
    end if;
  elsif p_action='delete' then
    delete from public.nexo_work_items where id=w.id;
    insert into public.nexo_work_events(tenant_id,item_id,actor_id,action,revision) values(p_tenant,w.id,p_user,'deleted',w.revision+1);
    return jsonb_build_object('id',w.id,'deleted',true);
  else raise exception 'NEXO_ACTION'; end if;
  update public.nexo_work_items set title=w.title,body=w.body,status=w.status,confirmed_by=w.confirmed_by,due_at=w.due_at,timezone=w.timezone,assignee_id=w.assignee_id,
    revision=revision+1,updated_at=now() where id=w.id returning * into w;
  insert into public.nexo_work_events(tenant_id,item_id,actor_id,action,revision) values(p_tenant,w.id,p_user,p_action,w.revision);
  return to_jsonb(w);
end $$;
revoke all on function public.nexo_change_work(uuid,uuid,uuid,integer,text,jsonb) from public,anon,authenticated;
grant execute on function public.nexo_change_work(uuid,uuid,uuid,integer,text,jsonb) to service_role;

-- No provider, email or browser required. Idempotent, transactional in-app inbox.
create function public.nexo_enqueue_task_reminders() returns integer
language plpgsql security invoker set search_path='' as $$
declare n integer;
begin
  with due as (
    select w.*,m.user_id as recipient from public.nexo_work_items w
    join public.tenant_members m on m.tenant_id=w.tenant_id and m.user_id=coalesce(w.assignee_id,w.created_by)
    where w.kind='task' and w.status='active' and w.due_at<=now()
      and not exists(select 1 from public.nexo_task_reminders r where r.item_id=w.id and r.user_id=m.user_id and r.due_at=w.due_at)
    order by w.due_at,w.id limit 500 for update of w skip locked
  ) insert into public.nexo_task_reminders(tenant_id,item_id,user_id,due_at)
    select tenant_id,id,recipient,due_at from due on conflict(item_id,user_id,due_at) do nothing;
  get diagnostics n=row_count; return n;
end $$;
revoke all on function public.nexo_enqueue_task_reminders() from public,anon,authenticated;
grant execute on function public.nexo_enqueue_task_reminders() to service_role;

-- Local PostgreSQL test runtimes may not ship pg_cron; production Supabase does.
do $$ begin
  if exists(select 1 from pg_available_extensions where name='pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('nexo-internal-task-reminders','* * * * *','select public.nexo_enqueue_task_reminders()');
  end if;
end $$;
