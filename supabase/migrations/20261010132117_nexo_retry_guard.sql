-- Failed/canceled turns refund messages, but repeated attempts still need a cost guard.
begin;
create index nexo_message_requests_attempts_idx on public.nexo_message_requests(owner_key,created_at);
create or replace function public.reserve_nexo_message(p_id uuid,p_tenant_id uuid,p_user_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_balance jsonb; v_owner jsonb; v_attempts integer; v_retry timestamptz;
begin
  v_owner := public.credit_balance(p_tenant_id,p_user_id);
  v_balance := public.nexo_message_balance(p_tenant_id,p_user_id);
  if exists(select 1 from public.nexo_message_requests where id=p_id) then raise exception 'nexo_message_duplicate'; end if;
  if (v_balance->>'availableMessages')::integer<=0 then return jsonb_build_object('ok',false,'balance',v_balance); end if;
  -- Released requests do not consume messages, but prevent unlimited paid upstream calls.
  select count(*),min(created_at)+interval '3 hours' into v_attempts,v_retry
    from public.nexo_message_requests where owner_key=v_owner->>'ownerKey' and created_at>now()-interval '3 hours';
  if v_attempts >= 3*(v_balance->>'quotaMessages')::integer then
    return jsonb_build_object('ok',false,'reason','retry_limit','retryAt',v_retry,'balance',v_balance);
  end if;
  insert into public.nexo_message_requests(id,owner_key,tenant_id,user_id)
    values(p_id,v_owner->>'ownerKey',p_tenant_id,case when p_tenant_id is null then p_user_id end);
  return jsonb_build_object('ok',true);
end; $$;
revoke execute on function public.reserve_nexo_message(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.reserve_nexo_message(uuid,uuid,uuid) to service_role;
commit;
