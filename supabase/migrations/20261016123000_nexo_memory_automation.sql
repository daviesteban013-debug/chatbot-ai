begin;
-- Working memory and automation hints. The owner may let NEXO keep business facts the
-- team states in chat (off by default, undoable like any other autonomous action), pin
-- the memories NEXO should always keep in mind, and gets a suggestion to automate a
-- low-risk action only after confirming it repeatedly by hand.

alter table public.nexo_autonomy_settings add column learn_from_chat boolean not null default false;

create or replace function public.nexo_configure_autonomy(p_tenant uuid, p_user uuid, p_settings jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.nexo_autonomy_settings;
begin
  perform 1 from public.tenant_members where tenant_id=p_tenant and user_id=p_user and role='owner' for share;
  if not found then raise exception 'AUTONOMY_OWNER_REQUIRED'; end if;
  if jsonb_typeof(p_settings) <> 'object' or exists(select 1 from jsonb_object_keys(p_settings) k where k not in ('catalog_stock','catalog_availability','work_items','learn_from_chat'))
    or exists(select 1 from jsonb_each(p_settings) e where jsonb_typeof(e.value) <> 'boolean') then raise exception 'AUTONOMY_INPUT'; end if;
  insert into public.nexo_autonomy_settings as a(tenant_id, catalog_stock, catalog_availability, work_items, learn_from_chat, updated_by)
    values(p_tenant, coalesce((p_settings->>'catalog_stock')::boolean,false), coalesce((p_settings->>'catalog_availability')::boolean,false),
      coalesce((p_settings->>'work_items')::boolean,false), coalesce((p_settings->>'learn_from_chat')::boolean,false), p_user)
    on conflict (tenant_id) do update set
      catalog_stock=coalesce((p_settings->>'catalog_stock')::boolean, a.catalog_stock),
      catalog_availability=coalesce((p_settings->>'catalog_availability')::boolean, a.catalog_availability),
      work_items=coalesce((p_settings->>'work_items')::boolean, a.work_items),
      learn_from_chat=coalesce((p_settings->>'learn_from_chat')::boolean, a.learn_from_chat),
      updated_by=p_user, updated_at=now()
    returning * into s;
  return to_jsonb(s);
end; $$;

-- Pinned memories are read by NEXO on every turn (at most five per business).
alter table public.nexo_work_items add column pinned boolean not null default false;
create index nexo_work_pinned on public.nexo_work_items(tenant_id) where pinned;

create or replace function public.nexo_change_work(p_tenant uuid,p_user uuid,p_id uuid,p_revision integer,p_action text,p_patch jsonb default '{}')
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
  elsif p_action='pin' and w.status='active' then
    if not w.pinned and (select count(*) from public.nexo_work_items where tenant_id=p_tenant and pinned)>=5 then raise exception 'NEXO_LIMIT'; end if;
    w.pinned=true;
  elsif p_action='unpin' and w.status='active' then w.pinned=false;
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
  if w.status in ('done','canceled') then w.pinned=false; end if;
  update public.nexo_work_items set title=w.title,body=w.body,status=w.status,confirmed_by=w.confirmed_by,due_at=w.due_at,timezone=w.timezone,assignee_id=w.assignee_id,
    pinned=w.pinned,revision=revision+1,updated_at=now() where id=w.id returning * into w;
  insert into public.nexo_work_events(tenant_id,item_id,actor_id,action,revision) values(p_tenant,w.id,p_user,p_action,w.revision);
  return to_jsonb(w);
end $$;

-- A business fact the team stated in chat, kept at once when the owner enabled it.
-- Never a customer note, never a second copy of a fact already known. Undo cancels it.
create function public.nexo_learn_business_fact(p_tenant uuid, p_user uuid, p_session text, p_key uuid, p_input jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.nexo_autonomy_settings; w jsonb; v_title text; existing public.nexo_work_items; v_log uuid;
begin
  perform 1 from public.tenant_members where tenant_id=p_tenant and user_id=p_user and role in ('owner','agent') for share;
  if not found then raise exception 'NEXO_FORBIDDEN'; end if;
  select * into s from public.nexo_autonomy_settings where tenant_id=p_tenant;
  if s.tenant_id is null or not s.learn_from_chat then raise exception 'MEMORY_DISABLED'; end if;
  if p_key is null or p_input is null or jsonb_typeof(p_input)<>'object' or p_input->>'kind' is distinct from 'memory' or nullif(p_input->>'customer_id','') is not null
    or coalesce(length(btrim(p_input->>'title')),0) not between 1 and 160 then raise exception 'NEXO_INPUT'; end if;
  v_title := btrim(p_input->>'title');
  perform pg_advisory_xact_lock(hashtextextended('memory:' || p_tenant::text, 0));
  select * into existing from public.nexo_work_items where tenant_id=p_tenant and created_by=p_user and request_key=p_key;
  if found then return to_jsonb(existing) || jsonb_build_object('auto', existing.status='active', 'duplicate', true); end if;
  select * into existing from public.nexo_work_items where tenant_id=p_tenant and kind='memory' and status='active' and customer_id is null
    and lower(title)=lower(v_title) order by created_at limit 1;
  if found then return to_jsonb(existing) || jsonb_build_object('auto', false, 'duplicate', true); end if;
  w := public.nexo_propose_work(p_tenant, p_user, p_session, p_key, p_input);
  w := public.nexo_change_work(p_tenant, p_user, (w->>'id')::uuid, (w->>'revision')::integer, 'confirm');
  insert into public.nexo_activity_log(tenant_id, user_id, session_id, kind, ref_id, summary, undo)
    values(p_tenant, p_user, p_session, 'work', (w->>'id')::uuid, left(format('Aprendió «%s»', w->>'title'), 300), jsonb_build_object('item_id', w->>'id'))
    returning id into v_log;
  return w || jsonb_build_object('auto', true, 'duplicate', false, 'log_id', v_log);
end; $$;

-- "Not now" hides a suggestion for this owner for 30 days.
create table public.nexo_suggestion_dismissals (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null check (key in ('catalog_stock','catalog_availability','work_items','learn_from_chat')),
  until timestamptz not null,
  primary key (tenant_id, user_id, key)
);
create index nexo_suggestion_dismissals_user on public.nexo_suggestion_dismissals(user_id);
alter table public.nexo_suggestion_dismissals enable row level security;
revoke all on public.nexo_suggestion_dismissals from public, anon, authenticated;
grant all on public.nexo_suggestion_dismissals to service_role;

create function public.nexo_dismiss_suggestion(p_tenant uuid, p_user uuid, p_key text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_until timestamptz := now() + interval '30 days';
begin
  perform 1 from public.tenant_members where tenant_id=p_tenant and user_id=p_user and role='owner' for share;
  if not found then raise exception 'SUGGESTIONS_FORBIDDEN'; end if;
  if p_key is null or p_key not in ('catalog_stock','catalog_availability','work_items','learn_from_chat') then raise exception 'SUGGESTIONS_INPUT'; end if;
  insert into public.nexo_suggestion_dismissals(tenant_id, user_id, key, until) values(p_tenant, p_user, p_key, v_until)
    on conflict (tenant_id, user_id, key) do update set until=excluded.until;
  return jsonb_build_object('key', p_key, 'until', v_until);
end; $$;

-- Owner only. A switch is suggested when, in the last 30 days, the team confirmed that
-- kind of change by hand at least five times, rejected at most one in five, and never
-- undid NEXO doing it alone. Enabled or dismissed keys are never suggested.
create function public.nexo_automation_suggestions(p_tenant uuid, p_user uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare s public.nexo_autonomy_settings; since timestamptz := now() - interval '30 days'; rows jsonb := '[]'::jsonb; r record;
begin
  if not exists(select 1 from public.tenant_members where tenant_id=p_tenant and user_id=p_user) then raise exception 'SUGGESTIONS_FORBIDDEN'; end if;
  if not exists(select 1 from public.tenant_members where tenant_id=p_tenant and user_id=p_user and role='owner') then return '[]'::jsonb; end if;
  select * into s from public.nexo_autonomy_settings where tenant_id=p_tenant;
  for r in
    select 'catalog_stock' as key, coalesce(s.catalog_stock,false) as enabled,
      (select count(*) from public.nexo_catalog_proposals p where p.tenant_id=p_tenant and p.snapshot->>'action'='stock' and p.status='applied' and not p.applied_by_nexo and p.created_at>since) as confirmed,
      (select count(*) from public.nexo_catalog_proposals p where p.tenant_id=p_tenant and p.snapshot->>'action'='stock' and p.status='canceled' and p.created_at>since) as rejected,
      (select count(*) from public.nexo_activity_log l join public.nexo_catalog_proposals p on p.id=l.ref_id
        where l.tenant_id=p_tenant and l.kind='catalog' and l.status='undone' and p.snapshot->>'action'='stock' and l.created_at>since) as undone
    union all
    select 'catalog_availability', coalesce(s.catalog_availability,false),
      (select count(*) from public.nexo_catalog_proposals p where p.tenant_id=p_tenant and p.snapshot->>'action'='availability' and p.status='applied' and not p.applied_by_nexo and p.created_at>since),
      (select count(*) from public.nexo_catalog_proposals p where p.tenant_id=p_tenant and p.snapshot->>'action'='availability' and p.status='canceled' and p.created_at>since),
      (select count(*) from public.nexo_activity_log l join public.nexo_catalog_proposals p on p.id=l.ref_id
        where l.tenant_id=p_tenant and l.kind='catalog' and l.status='undone' and p.snapshot->>'action'='availability' and l.created_at>since)
    union all
    select 'work_items', coalesce(s.work_items,false),
      (select count(*) from public.nexo_work_events e where e.tenant_id=p_tenant and e.action='confirm' and e.created_at>since
        and not exists(select 1 from public.nexo_activity_log l where l.tenant_id=p_tenant and l.kind='work' and l.ref_id=e.item_id)),
      (select count(*) from public.nexo_work_items w where w.tenant_id=p_tenant and w.status='canceled' and w.confirmed_by is null and w.created_at>since),
      (select count(*) from public.nexo_activity_log l where l.tenant_id=p_tenant and l.kind='work' and l.status='undone' and l.created_at>since)
    union all
    select 'learn_from_chat', coalesce(s.learn_from_chat,false),
      (select count(*) from public.nexo_work_items w where w.tenant_id=p_tenant and w.kind='memory' and w.status='active' and w.customer_id is null and w.source_session is not null and w.created_at>since
        and not exists(select 1 from public.nexo_activity_log l where l.tenant_id=p_tenant and l.kind='work' and l.ref_id=w.id)),
      (select count(*) from public.nexo_work_items w where w.tenant_id=p_tenant and w.kind='memory' and w.status='canceled' and w.confirmed_by is null and w.customer_id is null and w.source_session is not null and w.created_at>since),
      0
  loop
    if r.enabled or r.confirmed < 5 or r.rejected * 5 > r.confirmed or r.undone > 0
      or exists(select 1 from public.nexo_suggestion_dismissals d where d.tenant_id=p_tenant and d.user_id=p_user and d.key=r.key and d.until>now()) then continue; end if;
    rows := rows || jsonb_build_array(jsonb_build_object('key', r.key, 'confirmed', r.confirmed, 'rejected', r.rejected, 'undone', r.undone));
  end loop;
  return rows;
end; $$;

revoke all on function public.nexo_learn_business_fact(uuid,uuid,text,uuid,jsonb), public.nexo_dismiss_suggestion(uuid,uuid,text),
  public.nexo_automation_suggestions(uuid,uuid) from public, anon, authenticated;
grant execute on function public.nexo_learn_business_fact(uuid,uuid,text,uuid,jsonb), public.nexo_dismiss_suggestion(uuid,uuid,text),
  public.nexo_automation_suggestions(uuid,uuid) to service_role;
commit;
