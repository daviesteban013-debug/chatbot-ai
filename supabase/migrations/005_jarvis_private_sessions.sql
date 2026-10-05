-- Personal preferences must never be exposed through another user's chat.
-- Public demo sessions are accessed only by the server, using the service role.
begin;

drop policy if exists jarvis_sessions_auth_user_select on public.jarvis_sessions;
drop policy if exists jarvis_sessions_auth_user_insert on public.jarvis_sessions;
drop policy if exists jarvis_sessions_auth_user_update on public.jarvis_sessions;
drop policy if exists jarvis_messages_select on public.jarvis_messages;
drop policy if exists jarvis_messages_insert on public.jarvis_messages;

create policy jarvis_sessions_auth_user_select on public.jarvis_sessions
  for select to authenticated using (user_id = (select auth.uid()));
create policy jarvis_sessions_auth_user_insert on public.jarvis_sessions
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy jarvis_sessions_auth_user_update on public.jarvis_sessions
  for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy jarvis_messages_select on public.jarvis_messages
  for select to authenticated using (exists (
    select 1 from public.jarvis_sessions s
    where s.session_id = jarvis_messages.session_id and s.user_id = (select auth.uid())
  ));
create policy jarvis_messages_insert on public.jarvis_messages
  for insert to authenticated with check (exists (
    select 1 from public.jarvis_sessions s
    where s.session_id = jarvis_messages.session_id and s.user_id = (select auth.uid())
  ));

commit;
