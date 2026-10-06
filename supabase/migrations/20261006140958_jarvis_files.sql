begin;

create table public.jarvis_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id text references public.jarvis_sessions(session_id) on delete set null,
  filename text not null check (length(filename) between 1 and 160),
  object_path text not null unique,
  mime_type text not null,
  byte_size integer not null check (byte_size between 1 and 3145728),
  status text not null check (status in ('ready', 'needs_ocr')),
  sections jsonb not null default '[]'::jsonb check (jsonb_typeof(sections) = 'array' and octet_length(sections::text) <= 1500000),
  section_count integer generated always as (jsonb_array_length(sections)) stored,
  warnings jsonb not null default '[]'::jsonb check (jsonb_typeof(warnings) = 'array'),
  truncated boolean not null default false,
  created_at timestamptz not null default now(),
  check (object_path = user_id::text || '/' || id::text)
);
create index jarvis_files_user_session on public.jarvis_files(user_id, session_id, created_at desc);
alter table public.jarvis_files enable row level security;
revoke all on public.jarvis_files from public, anon, authenticated;
grant select on public.jarvis_files to authenticated;
grant all on public.jarvis_files to service_role;
create policy jarvis_files_owner_read on public.jarvis_files for select to authenticated
  using (user_id = (select auth.uid()));

-- The API owns writes; serialize the per-account storage quota across instances.
create function public.guard_jarvis_files() returns trigger language plpgsql
security invoker set search_path = '' as $$
declare count_files integer; total_bytes bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 17));
  if tg_op = 'UPDATE' and (new.user_id <> old.user_id or new.id <> old.id or new.object_path <> old.object_path or new.byte_size <> old.byte_size) then
    raise exception 'file_identity_immutable';
  end if;
  if new.session_id is not null and not exists (
    select 1 from public.jarvis_sessions where session_id = new.session_id and user_id = new.user_id
  ) then raise exception 'file_session_forbidden'; end if;
  if tg_op = 'UPDATE' and old.session_id is not null and new.session_id is not null and old.session_id <> new.session_id then
    raise exception 'file_session_immutable';
  end if;
  if tg_op = 'INSERT' then
    select count(*), coalesce(sum(byte_size),0) into count_files,total_bytes from public.jarvis_files where user_id = new.user_id;
    if count_files >= 40 or total_bytes + new.byte_size > 62914560 then raise exception 'file_quota_exhausted'; end if;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_jarvis_files() from public, anon, authenticated;
grant execute on function public.guard_jarvis_files() to service_role;
create trigger jarvis_files_guard before insert or update on public.jarvis_files
  for each row execute function public.guard_jarvis_files();

-- Storage is a Supabase service. Embedded SQL tests need only the application table.
do $$ begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets(id,name,public,file_size_limit)
      values ('jarvis-files','jarvis-files',false,3145728)
      on conflict (id) do update set public = false, file_size_limit = 3145728;
  end if;
end $$;
-- No browser Storage policies: uploads/downloads go through authorized server routes.
commit;
