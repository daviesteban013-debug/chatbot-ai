begin;
-- Background jobs: NEXO works on long tasks (catalog import, stock/price update from a
-- file, collections review) outside the chat turn. A pg_cron → pg_net ticket wakes a
-- short-lived worker that claims one job under a lease, checkpoints before every effect
-- and hands the job back when its time budget ends. Recipes reuse the existing proposal,
-- autonomy and reminder RPCs: nothing here writes the catalog or messages customers itself.

create table public.nexo_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id text not null references public.jarvis_sessions(session_id) on delete cascade,
  kind text not null check (kind in ('catalog_import','catalog_update','collections_review')),
  status text not null default 'queued' check (status in ('queued','running','done','failed','canceled')),
  input jsonb not null default '{}'::jsonb check (jsonb_typeof(input)='object' and octet_length(input::text) <= 20000),
  checkpoint jsonb not null default '{}'::jsonb check (jsonb_typeof(checkpoint)='object' and octet_length(checkpoint::text) <= 1500000),
  progress jsonb not null default '{}'::jsonb check (jsonb_typeof(progress)='object' and octet_length(progress::text) <= 4000),
  result jsonb check (result is null or (jsonb_typeof(result)='object' and octet_length(result::text) <= 1500000)),
  error text check (error is null or length(error) between 1 and 300),
  request_key text not null check (length(request_key) between 1 and 120),
  attempts integer not null default 0,
  rounds integer not null default 0,
  lease_token uuid,
  lease_until timestamptz,
  canceled_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  applied_at timestamptz,
  unique (tenant_id, user_id, request_key)
);
create index nexo_jobs_tenant on public.nexo_jobs(tenant_id, created_at desc);
create index nexo_jobs_user on public.nexo_jobs(user_id);
create index nexo_jobs_session on public.nexo_jobs(session_id);
create index nexo_jobs_canceled_by on public.nexo_jobs(canceled_by);
create index nexo_jobs_active on public.nexo_jobs(created_at) where status in ('queued','running');
create index nexo_jobs_finished on public.nexo_jobs(user_id, finished_at desc) where status in ('done','failed');
alter table public.nexo_jobs enable row level security;
revoke all on public.nexo_jobs from public, anon, authenticated;
grant select on public.nexo_jobs to authenticated;
grant all on public.nexo_jobs to service_role;
create policy nexo_jobs_team_read on public.nexo_jobs for select to authenticated
  using (exists (select 1 from public.tenant_members m where m.tenant_id=nexo_jobs.tenant_id and m.user_id=(select auth.uid()) and m.role in ('owner','agent')));

-- One-use tickets for server workers woken by pg_net (the sales tickets table is unchanged).
create table public.nexo_worker_tickets (
  token_hash text primary key,
  worker text not null check (length(worker) between 1 and 40),
  expires_at timestamptz not null,
  consumed_at timestamptz
);
alter table public.nexo_worker_tickets enable row level security;
revoke all on public.nexo_worker_tickets from public, anon, authenticated;
grant all on public.nexo_worker_tickets to service_role;

-- Finished jobs appear in "what NEXO did"; they are never undoable there.
alter table public.nexo_activity_log drop constraint nexo_activity_log_kind_check;
alter table public.nexo_activity_log add constraint nexo_activity_log_kind_check check (kind in ('catalog','work','job'));

create function public.nexo_job_label(p_kind text) returns text language sql immutable set search_path='' as $$
  select case p_kind when 'catalog_import' then 'Importar catálogo desde archivo'
    when 'catalog_update' then 'Actualizar stock o precios desde archivo'
    else 'Revisión de cobros' end;
$$;

-- Internal: history entry when a job ends.
create function public.nexo_job_record(p_job public.nexo_jobs) returns void
language plpgsql security invoker set search_path='' as $$
begin
  insert into public.nexo_activity_log(tenant_id, user_id, session_id, kind, ref_id, summary, undo)
    values(p_job.tenant_id, p_job.user_id, p_job.session_id, 'job', p_job.id,
      left(case when p_job.status='done' then coalesce(nullif(p_job.result->>'summary',''), 'Terminó: ' || public.nexo_job_label(p_job.kind))
        else 'No pude terminar: ' || public.nexo_job_label(p_job.kind) end, 300), '{}'::jsonb);
end; $$;

-- pg_net sends after commit. Each request carries a short-lived, one-use ticket.
create function public.nexo_dispatch_jobs_worker() returns void
language plpgsql security invoker set search_path='' as $$
declare token uuid;
begin
  delete from public.nexo_worker_tickets where expires_at < clock_timestamp() - interval '1 day';
  if not exists(select 1 from public.nexo_jobs where status='queued') then return; end if;
  -- Local test databases have no pg_net: the queue simply waits for a worker.
  if not exists(select 1 from pg_extension where extname='pg_net') then return; end if;
  token := gen_random_uuid();
  insert into public.nexo_worker_tickets(token_hash, worker, expires_at)
    values(encode(sha256(convert_to(token::text,'UTF8')),'hex'), 'jobs', clock_timestamp() + interval '2 minutes');
  execute 'select net.http_post(url:=$1, body:=$2, headers:=$3, timeout_milliseconds:=$4)'
    using 'https://chatbot-ai-gold-two.vercel.app/api/jarvis/jobs/worker'::text, jsonb_build_object('token', token), '{"Content-Type":"application/json"}'::jsonb, 58000::integer;
end; $$;

create function public.nexo_consume_worker_ticket(p_token uuid, p_worker text) returns boolean
language plpgsql security invoker set search_path='' as $$
declare consumed text;
begin
  update public.nexo_worker_tickets set consumed_at=clock_timestamp()
    where token_hash=encode(sha256(convert_to(p_token::text,'UTF8')),'hex') and worker=p_worker and consumed_at is null and expires_at>clock_timestamp()
    returning token_hash into consumed;
  return consumed is not null;
end; $$;

-- Queues a job for this user's conversation. Files must belong to the user; they are bound
-- to the conversation like chat attachments. Two active jobs per business, thirty per day.
create function public.nexo_start_job(p_tenant uuid, p_user uuid, p_session text, p_kind text, p_input jsonb, p_key text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare j public.nexo_jobs; files jsonb; f jsonb; n_files integer; v_mime text; v_input jsonb;
begin
  perform 1 from public.tenant_members where tenant_id=p_tenant and user_id=p_user and role in ('owner','agent') for share;
  if not found then raise exception 'JOB_FORBIDDEN'; end if;
  perform 1 from public.jarvis_sessions where session_id=p_session and tenant_id=p_tenant and user_id=p_user for share;
  if not found then raise exception 'JOB_FORBIDDEN'; end if;
  if p_kind not in ('catalog_import','catalog_update','collections_review') or p_input is null or jsonb_typeof(p_input) <> 'object'
    or coalesce(length(p_key),0) not between 1 and 120 then raise exception 'JOB_INPUT'; end if;
  files := coalesce(p_input->'file_ids', '[]'::jsonb);
  if jsonb_typeof(files) <> 'array' then raise exception 'JOB_INPUT'; end if;
  n_files := jsonb_array_length(files);
  if (p_kind='catalog_import' and n_files not between 1 and 3) or (p_kind='catalog_update' and n_files <> 1)
    or (p_kind='collections_review' and n_files <> 0) then raise exception 'JOB_FILES'; end if;
  if (select count(distinct value) from jsonb_array_elements_text(files)) <> n_files then raise exception 'JOB_INPUT'; end if;
  perform pg_advisory_xact_lock(hashtextextended('jobs:' || p_tenant::text, 0));
  select * into j from public.nexo_jobs where tenant_id=p_tenant and user_id=p_user and request_key=p_key;
  if found then return to_jsonb(j) || jsonb_build_object('existing', true); end if;
  if (select count(*) from public.nexo_jobs where tenant_id=p_tenant and status in ('queued','running')) >= 2
    or (select count(*) from public.nexo_jobs where tenant_id=p_tenant and created_at > now() - interval '24 hours') >= 30 then raise exception 'JOB_LIMIT'; end if;
  for f in select value from jsonb_array_elements(files) loop
    if jsonb_typeof(f) <> 'string' or (f #>> '{}') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'JOB_INPUT'; end if;
    select mime_type into v_mime from public.jarvis_files where id=(f #>> '{}')::uuid and user_id=p_user and (session_id is null or session_id=p_session) for update;
    if not found then raise exception 'JOB_FILES'; end if;
    if p_kind='catalog_update' and v_mime not in ('text/csv','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') then raise exception 'JOB_FILES'; end if;
    update public.jarvis_files set session_id=p_session where id=(f #>> '{}')::uuid and session_id is null;
  end loop;
  v_input := jsonb_strip_nulls(jsonb_build_object('file_ids', files, 'note', left(p_input->>'note', 500),
    'options', case when jsonb_typeof(p_input->'options')='object' then p_input->'options' end));
  insert into public.nexo_jobs(tenant_id, user_id, session_id, kind, input, request_key) values(p_tenant, p_user, p_session, p_kind, v_input, p_key) returning * into j;
  perform public.nexo_dispatch_jobs_worker();
  return to_jsonb(j) || jsonb_build_object('existing', false);
end; $$;

-- The worker takes one queued job under a 3-minute lease. A worker that vanished loses
-- its lease and the job resumes from its checkpoint, up to four times.
create function public.nexo_claim_jobs(p_limit integer default 1) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare j public.nexo_jobs; result jsonb := '[]'::jsonb; token uuid;
begin
  for j in select * from public.nexo_jobs where status='running' and lease_until < clock_timestamp() for update skip locked loop
    if j.attempts + 1 >= 4 then
      update public.nexo_jobs set status='failed', attempts=attempts+1, error='NEXO perdió la conexión con este trabajo varias veces. Vuelve a intentarlo.',
        lease_token=null, lease_until=null, finished_at=clock_timestamp(), updated_at=clock_timestamp() where id=j.id returning * into j;
      perform public.nexo_job_record(j);
    else
      update public.nexo_jobs set status='queued', attempts=attempts+1, lease_token=null, lease_until=null, updated_at=clock_timestamp() where id=j.id;
    end if;
  end loop;
  for j in select * from public.nexo_jobs where status='queued' order by created_at, id for update skip locked limit greatest(1, least(coalesce(p_limit,1),3)) loop
    token := gen_random_uuid();
    update public.nexo_jobs set status='running', lease_token=token, lease_until=clock_timestamp()+interval '3 minutes', rounds=rounds+1,
      started_at=coalesce(started_at, clock_timestamp()), updated_at=clock_timestamp() where id=j.id returning * into j;
    result := result || jsonb_build_array(to_jsonb(j));
  end loop;
  return result;
end; $$;

create function public.nexo_job_heartbeat(p_id uuid, p_lease uuid, p_progress jsonb default null, p_checkpoint jsonb default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare j public.nexo_jobs;
begin
  select * into j from public.nexo_jobs where id=p_id and p_lease is not null and lease_token=p_lease for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'lease_lost'); end if;
  if j.status='canceled' then return jsonb_build_object('ok', false, 'canceled', true, 'reason', 'canceled'); end if;
  if j.status<>'running' then return jsonb_build_object('ok', false, 'reason', 'not_running'); end if;
  if (p_progress is not null and jsonb_typeof(p_progress)<>'object') or (p_checkpoint is not null and jsonb_typeof(p_checkpoint)<>'object') then raise exception 'JOB_INPUT'; end if;
  update public.nexo_jobs set lease_until=clock_timestamp()+interval '3 minutes', progress=coalesce(p_progress, progress),
    checkpoint=coalesce(p_checkpoint, checkpoint), updated_at=clock_timestamp() where id=p_id;
  return jsonb_build_object('ok', true, 'canceled', false);
end; $$;

-- The worker's time budget ended: the job goes back to the queue with its checkpoint.
create function public.nexo_release_job(p_id uuid, p_lease uuid, p_checkpoint jsonb default null, p_progress jsonb default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare j public.nexo_jobs;
begin
  select * into j from public.nexo_jobs where id=p_id and p_lease is not null and lease_token=p_lease for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'lease_lost'); end if;
  if j.status<>'running' then return jsonb_build_object('ok', false, 'status', j.status); end if;
  if (p_progress is not null and jsonb_typeof(p_progress)<>'object') or (p_checkpoint is not null and jsonb_typeof(p_checkpoint)<>'object') then raise exception 'JOB_INPUT'; end if;
  if j.rounds >= 10 then
    update public.nexo_jobs set status='failed', error='El trabajo tardó demasiado. Divide el archivo en partes más pequeñas.', lease_token=null, lease_until=null,
      checkpoint='{}'::jsonb, progress=coalesce(p_progress, progress), finished_at=clock_timestamp(), updated_at=clock_timestamp() where id=p_id returning * into j;
    perform public.nexo_job_record(j);
    return jsonb_build_object('ok', true, 'status', 'failed');
  end if;
  update public.nexo_jobs set status='queued', lease_token=null, lease_until=null, checkpoint=coalesce(p_checkpoint, checkpoint),
    progress=coalesce(p_progress, progress), updated_at=clock_timestamp() where id=p_id;
  perform public.nexo_dispatch_jobs_worker();
  return jsonb_build_object('ok', true, 'status', 'queued');
end; $$;

create function public.nexo_finish_job(p_id uuid, p_lease uuid, p_status text, p_result jsonb default null, p_error text default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare j public.nexo_jobs; ids uuid[];
begin
  if p_status not in ('done','failed') then raise exception 'JOB_INPUT'; end if;
  select * into j from public.nexo_jobs where id=p_id and p_lease is not null and lease_token=p_lease for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'lease_lost'); end if;
  if j.status='canceled' then return jsonb_build_object('ok', false, 'canceled', true, 'reason', 'canceled'); end if;
  if j.status<>'running' then return jsonb_build_object('ok', false, 'status', j.status); end if;
  if p_status='done' and (p_result is null or jsonb_typeof(p_result)<>'object') then raise exception 'JOB_INPUT'; end if;
  update public.nexo_jobs set status=p_status, result=case when p_status='done' then p_result end,
    error=case when p_status='failed' then left(coalesce(nullif(p_error,''), 'No pude terminar este trabajo.'), 300) end,
    checkpoint='{}'::jsonb, lease_token=null, lease_until=null, finished_at=clock_timestamp(), updated_at=clock_timestamp() where id=p_id returning * into j;
  -- Price cards prepared by a job stay reviewable for a day instead of the chat's 15 minutes.
  if p_status='done' and jsonb_typeof(p_result->'proposal_ids')='array' then
    select array_agg(value::uuid) into ids from jsonb_array_elements_text(p_result->'proposal_ids');
    update public.nexo_catalog_proposals set expires_at=greatest(expires_at, clock_timestamp()+interval '24 hours')
      where id = any(ids) and tenant_id=j.tenant_id and user_id=j.user_id and session_id=j.session_id and status='pending';
  end if;
  perform public.nexo_job_record(j);
  return jsonb_build_object('ok', true, 'status', p_status);
end; $$;

create function public.nexo_cancel_job(p_tenant uuid, p_user uuid, p_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare j public.nexo_jobs;
begin
  perform 1 from public.tenant_members where tenant_id=p_tenant and user_id=p_user and role in ('owner','agent') for share;
  if not found then raise exception 'JOB_FORBIDDEN'; end if;
  select * into j from public.nexo_jobs where id=p_id and tenant_id=p_tenant for update;
  if not found then raise exception 'JOB_NOT_FOUND'; end if;
  if j.status in ('queued','running') then
    -- The lease token stays: a worker still holding it learns of the cancellation on its next heartbeat.
    update public.nexo_jobs set status='canceled', canceled_by=p_user, finished_at=clock_timestamp(), updated_at=clock_timestamp() where id=p_id returning * into j;
  end if;
  return to_jsonb(j);
end; $$;

-- The owner clicked "apply" on an import review: the outcome is kept with the job.
create function public.nexo_mark_job_applied(p_tenant uuid, p_user uuid, p_id uuid, p_outcome jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare j public.nexo_jobs;
begin
  perform 1 from public.tenant_members where tenant_id=p_tenant and user_id=p_user and role in ('owner','agent') for share;
  if not found then raise exception 'JOB_FORBIDDEN'; end if;
  select * into j from public.nexo_jobs where id=p_id and tenant_id=p_tenant for update;
  if not found then raise exception 'JOB_NOT_FOUND'; end if;
  if j.status<>'done' or j.kind<>'catalog_import' or j.applied_at is not null then raise exception 'JOB_STATE'; end if;
  if p_outcome is null or jsonb_typeof(p_outcome)<>'object' or octet_length(p_outcome::text) > 60000 then raise exception 'JOB_INPUT'; end if;
  update public.nexo_jobs set applied_at=clock_timestamp(), result=result || jsonb_build_object('applied', p_outcome), updated_at=clock_timestamp() where id=p_id returning * into j;
  return to_jsonb(j);
end; $$;

-- Unpaid orders, oldest first, in pages (keyset on created_at,id).
create function public.nexo_unpaid_orders(p_tenant uuid, p_after_created timestamptz default null, p_after_id uuid default null, p_limit integer default 100) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
begin
  return coalesce((select jsonb_agg(x) from (
    select o.id, o.created_at, o.updated_at, o.total, o.payment_method, o.payment_status, o.conversation_id,
      jsonb_build_object('id', c.id, 'name', nullif(c.name,''), 'phone', c.phone) as customer
    from public.orders o join public.customers c on c.id=o.customer_id
    where o.tenant_id=p_tenant and o.status='pending_payment' and o.payment_status<>'paid'
      and (p_after_created is null or p_after_id is null or (o.created_at, o.id) > (p_after_created, p_after_id))
    order by o.created_at, o.id limit greatest(1, least(coalesce(p_limit,100),100))) x), '[]'::jsonb);
end; $$;

-- How each unpaid order stands with the WhatsApp reminder queue. Read-only: reminders are
-- created only by nexo_enqueue_sales_followups under its own eligibility rules.
create function public.nexo_collections_status(p_tenant uuid, p_orders uuid[]) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare v_enabled boolean;
begin
  if p_orders is null or array_length(p_orders,1) is null or array_length(p_orders,1) > 100 then raise exception 'JOB_INPUT'; end if;
  select s.enabled into v_enabled from public.nexo_sales_followup_settings s where s.tenant_id=p_tenant;
  return coalesce((select jsonb_object_agg(o.id, jsonb_strip_nulls(jsonb_build_object(
      'state', case when f.sent > 0 then 'reminded' when f.pending > 0 then 'scheduled' else 'requires_call' end,
      'reason', case when f.sent > 0 or f.pending > 0 then null
        when not coalesce(v_enabled,false) then 'followups_paused'
        when f.last_reason is not null then f.last_reason
        when o.payment_method is null or o.payment_method::text not in ('enlace','transferencia') then 'payment_method'
        when o.conversation_id is null or not exists(select 1 from public.messages m where m.tenant_id=p_tenant and m.conversation_id=o.conversation_id
          and m.direction='inbound' and m.sender='customer' and m.raw->>'nexo_confirmed_order'=o.id::text) then 'not_whatsapp_confirmed'
        when o.created_at <= now() - interval '23 hours 59 minutes' then 'service_window_closed'
        else 'not_eligible' end,
      'reminders', f.sent, 'reminded_at', f.reminded_at, 'due_at', f.due_at)))
    from public.orders o
    left join lateral (
      select count(*) filter (where x.status='sent') as sent,
        count(*) filter (where x.status in ('queued','claimed','sending')) as pending,
        max(x.dispatched_at) filter (where x.status='sent') as reminded_at,
        min(x.due_at) filter (where x.status in ('queued','claimed','sending')) as due_at,
        (select y.reason from public.nexo_sales_followups y where y.order_id=o.id and y.status in ('canceled','blocked','failed','unknown') order by y.updated_at desc limit 1) as last_reason
      from public.nexo_sales_followups x where x.order_id=o.id) f on true
    where o.tenant_id=p_tenant and o.id = any(p_orders)), '{}'::jsonb);
end; $$;

-- Finished jobs join the activity feed (not undoable) and the proactive pulse.
create or replace function public.nexo_undo_activity(p_tenant uuid, p_user uuid, p_log uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare l public.nexo_activity_log; line jsonb; cur record; w public.nexo_work_items;
begin
  perform 1 from public.tenant_members where tenant_id=p_tenant and user_id=p_user and role in ('owner','agent') for share;
  if not found then raise exception 'ACTIVITY_FORBIDDEN'; end if;
  select * into l from public.nexo_activity_log where id=p_log and tenant_id=p_tenant for update;
  if not found then raise exception 'ACTIVITY_NOT_FOUND'; end if;
  if l.kind = 'job' then return jsonb_build_object('ok', false, 'code', 'not_undoable'); end if;
  if l.status <> 'applied' then return jsonb_build_object('ok', false, 'code', 'undone'); end if;
  if l.created_at < now() - interval '7 days' then return jsonb_build_object('ok', false, 'code', 'too_old'); end if;
  if l.kind = 'catalog' then
    for line in select value from jsonb_array_elements(l.undo->'lines') loop
      if line->>'kind' = 'stock' then
        select stock_qty, reserved_qty into cur from public.product_variants where id=(line->>'variant_id')::uuid and tenant_id=p_tenant for update;
        if not found or cur.stock_qty <> (line->>'from')::bigint or (line->>'to')::bigint < cur.reserved_qty then return jsonb_build_object('ok', false, 'code', 'changed'); end if;
      else
        select active into cur from public.products where id=(line->>'product_id')::uuid and tenant_id=p_tenant for update;
        if not found or cur.active <> (line->>'from')::boolean then return jsonb_build_object('ok', false, 'code', 'changed'); end if;
      end if;
    end loop;
    for line in select value from jsonb_array_elements(l.undo->'lines') loop
      if line->>'kind' = 'stock' then
        update public.product_variants set stock_qty=(line->>'to')::bigint where id=(line->>'variant_id')::uuid and tenant_id=p_tenant;
      else
        update public.products set active=(line->>'to')::boolean, updated_at=now() where id=(line->>'product_id')::uuid and tenant_id=p_tenant;
      end if;
    end loop;
  else
    select * into w from public.nexo_work_items where id=(l.undo->>'item_id')::uuid and tenant_id=p_tenant;
    if not found or w.status <> 'active' then return jsonb_build_object('ok', false, 'code', 'changed'); end if;
    perform public.nexo_change_work(p_tenant, p_user, w.id, w.revision, 'cancel');
  end if;
  update public.nexo_activity_log set status='undone', undone_at=now(), undone_by=p_user where id=l.id;
  return jsonb_build_object('ok', true);
end; $$;

create or replace function public.nexo_activity_feed(p_tenant uuid, p_user uuid, p_limit integer default 20)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin
  if not exists(select 1 from public.tenant_members where tenant_id=p_tenant and user_id=p_user and role in ('owner','agent')) then raise exception 'ACTIVITY_FORBIDDEN'; end if;
  return coalesce((select jsonb_agg(x order by x.at desc) from (
    (select l.created_at as at, l.kind, l.summary as text,
        case l.kind when 'catalog' then '/dashboard/catalog' when 'job' then '/dashboard/jobs/' || l.ref_id else '/dashboard/workspace' end as href,
        l.id as log_id, l.status, (l.kind <> 'job' and l.status='applied' and l.created_at > now() - interval '7 days') as undoable
      from public.nexo_activity_log l where l.tenant_id=p_tenant and l.created_at > now() - interval '30 days'
      order by l.created_at desc limit 50)
    union all
    (select coalesce(f.dispatched_at, f.updated_at), 'reminder',
        format('Recordó el pago a %s', coalesce(nullif(c.name,''), c.phone)),
        '/dashboard/orders/' || f.order_id, null::uuid, 'applied', false
      from public.nexo_sales_followups f join public.customers c on c.id=f.customer_id
      where f.tenant_id=p_tenant and f.status='sent' and coalesce(f.dispatched_at, f.updated_at) > now() - interval '30 days'
      order by 1 desc limit 50)
    union all
    (select o.created_at, 'sale',
        format('Vendió $%s a %s por WhatsApp', replace(to_char(o.total, 'FM999,999,999,990'), ',', '.'), coalesce(nullif(c.name,''), c.phone)),
        '/dashboard/orders/' || o.id, null::uuid, 'applied', false
      from public.orders o join public.customers c on c.id=o.customer_id
      where o.tenant_id=p_tenant and o.created_by='agent' and o.status::text in ('pending_payment','confirmed','shipped','delivered')
        and o.created_at > now() - interval '30 days'
      order by 1 desc limit 50)
    order by 1 desc limit least(greatest(p_limit, 1), 50)) x), '[]'::jsonb);
end; $$;

create or replace function public.nexo_pulse(p_tenant uuid, p_user uuid)
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
        order by w.due_at desc limit 20) x), '[]'::jsonb),
    'jobs', coalesce((select jsonb_agg(x) from (
        select j.id, j.kind, j.status, j.finished_at as at, coalesce(nullif(j.result->>'summary',''), j.error) as summary
        from public.nexo_jobs j
        where j.tenant_id=p_tenant and j.user_id=p_user and j.status in ('done','failed') and j.finished_at > now() - interval '24 hours'
        order by j.finished_at desc limit 20) x), '[]'::jsonb)
  );
end; $$;

revoke all on function public.nexo_job_label(text), public.nexo_job_record(public.nexo_jobs), public.nexo_dispatch_jobs_worker(),
  public.nexo_consume_worker_ticket(uuid,text), public.nexo_start_job(uuid,uuid,text,text,jsonb,text), public.nexo_claim_jobs(integer),
  public.nexo_job_heartbeat(uuid,uuid,jsonb,jsonb), public.nexo_release_job(uuid,uuid,jsonb,jsonb), public.nexo_finish_job(uuid,uuid,text,jsonb,text),
  public.nexo_cancel_job(uuid,uuid,uuid), public.nexo_mark_job_applied(uuid,uuid,uuid,jsonb), public.nexo_unpaid_orders(uuid,timestamptz,uuid,integer),
  public.nexo_collections_status(uuid,uuid[]) from public, anon, authenticated;
grant execute on function public.nexo_job_label(text), public.nexo_job_record(public.nexo_jobs), public.nexo_dispatch_jobs_worker(),
  public.nexo_consume_worker_ticket(uuid,text), public.nexo_start_job(uuid,uuid,text,text,jsonb,text), public.nexo_claim_jobs(integer),
  public.nexo_job_heartbeat(uuid,uuid,jsonb,jsonb), public.nexo_release_job(uuid,uuid,jsonb,jsonb), public.nexo_finish_job(uuid,uuid,text,jsonb,text),
  public.nexo_cancel_job(uuid,uuid,uuid), public.nexo_mark_job_applied(uuid,uuid,uuid,jsonb), public.nexo_unpaid_orders(uuid,timestamptz,uuid,integer),
  public.nexo_collections_status(uuid,uuid[]) to service_role;

do $$ begin
  if exists(select 1 from pg_extension where extname='pg_cron') and exists(select 1 from pg_extension where extname='pg_net') then
    perform cron.schedule('nexo-jobs-worker','* * * * *','select public.nexo_dispatch_jobs_worker()');
  end if;
end $$;
commit;
