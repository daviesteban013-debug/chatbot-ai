-- Metadata readable by members; credentials writable/readable only by server.
alter table public.whatsapp_accounts
  add column connection_status text not null default 'pending'
    check (connection_status in ('pending','verified','needs_attention')),
  add column verified_at timestamptz,
  add column last_webhook_at timestamptz;
create unique index whatsapp_accounts_one_per_tenant on public.whatsapp_accounts(tenant_id);

drop policy whatsapp_accounts_tenant_all on public.whatsapp_accounts;
create policy whatsapp_accounts_member_read on public.whatsapp_accounts for select to authenticated
  using (tenant_id in (select m.tenant_id from public.tenant_members m where m.user_id=(select auth.uid())));
revoke all on public.whatsapp_accounts from public, anon, authenticated;
-- A SELECT * must fail: tokens never travel to a browser, even encrypted.
grant select (id,tenant_id,phone_number_id,waba_id,display_phone,created_at,
  connection_status,verified_at,last_webhook_at) on public.whatsapp_accounts to authenticated;
grant all on public.whatsapp_accounts to service_role;
-- SECURITY INVOKER needs explicit privileges, in addition to BYPASSRLS.
grant select, update on public.tenants to service_role;
grant select on public.tenant_members to service_role;

create function public.configure_whatsapp_cloud(
  p_tenant uuid, p_user uuid, p_phone text, p_waba text, p_display text, p_ciphertext text
) returns uuid language plpgsql security invoker set search_path='' as $$
declare account_id uuid;
begin
  -- Serializes setup/replacement for this business and rechecks owner at write time.
  perform 1 from public.tenants where id=p_tenant for update;
  if p_user is null or not exists (select 1 from public.tenant_members
      where tenant_id=p_tenant and user_id=p_user and role='owner') then
    raise exception 'WHATSAPP_OWNER_REQUIRED' using errcode='42501';
  end if;
  if p_phone is null or p_phone !~ '^[0-9]{5,30}$'
     or p_waba is null or p_waba !~ '^[0-9]{5,30}$'
     or p_display is null or char_length(p_display) not between 1 and 40
     or p_ciphertext is null or char_length(p_ciphertext) not between 60 and 18000
     or p_ciphertext !~ '^wa[.]v1[.][A-Za-z0-9_-]+[.][A-Za-z0-9_-]+[.][A-Za-z0-9_-]+$' then
    raise exception 'WHATSAPP_INVALID_CONFIG' using errcode='22023';
  end if;
  insert into public.whatsapp_accounts(tenant_id,phone_number_id,waba_id,display_phone,
      access_token_enc,connection_status,verified_at)
    values(p_tenant,p_phone,p_waba,p_display,p_ciphertext,'verified',now())
  on conflict(tenant_id) do update set
    phone_number_id=excluded.phone_number_id, waba_id=excluded.waba_id,
    display_phone=excluded.display_phone, access_token_enc=excluded.access_token_enc,
    connection_status='verified',verified_at=now(),
    last_webhook_at=case when whatsapp_accounts.phone_number_id=excluded.phone_number_id
      then whatsapp_accounts.last_webhook_at else null end
  returning id into account_id;
  return account_id;
end;
$$;
revoke all on function public.configure_whatsapp_cloud(uuid,uuid,text,text,text,text)
  from public,anon,authenticated;
grant execute on function public.configure_whatsapp_cloud(uuid,uuid,text,text,text,text) to service_role;
