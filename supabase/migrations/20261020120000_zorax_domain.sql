-- The product moved to its own domain. Both pg_cron dispatchers call the workers at zoraxpilot.com;
-- everything else about them (tickets, guards, timeouts) stays exactly as before.
create or replace function public.nexo_dispatch_jobs_worker() returns void
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
    using 'https://zoraxpilot.com/api/jarvis/jobs/worker'::text, jsonb_build_object('token', token), '{"Content-Type":"application/json"}'::jsonb, 58000::integer;
end; $$;

create or replace function public.nexo_dispatch_sales_followup_worker() returns void
language plpgsql security invoker set search_path='' as $$
declare token uuid;
begin
  perform public.nexo_enqueue_sales_followups();
  delete from public.nexo_sales_worker_tickets where expires_at<clock_timestamp()-interval '1 day';
  if not exists(select 1 from public.nexo_sales_followups where status='queued' and due_at<=clock_timestamp()) then return; end if;
  token:=gen_random_uuid();
  insert into public.nexo_sales_worker_tickets(token_hash,expires_at) values(encode(sha256(convert_to(token::text,'UTF8')),'hex'),clock_timestamp()+interval '2 minutes');
  perform net.http_post(url:='https://zoraxpilot.com/api/whatsapp/followups',body:=jsonb_build_object('token',token),headers:='{"Content-Type":"application/json"}'::jsonb,timeout_milliseconds:=55000);
end $$;
