-- Coexistence: when a business links its WhatsApp Business app, Meta sends its contacts and up to
-- 180 days of chats only if Zorax asks within 24 hours of linking, once per type. These columns keep
-- the link time, each request and the import progress, so the owner sees it and can retry in time.
alter table public.whatsapp_accounts
  add column if not exists app_linked_at timestamptz,
  add column if not exists contacts_sync_requested_at timestamptz,
  add column if not exists history_sync_requested_at timestamptz,
  add column if not exists history_sync_progress smallint check (history_sync_progress between 0 and 100),
  add column if not exists history_sync_declined boolean not null default false;
grant select (app_linked_at,contacts_sync_requested_at,history_sync_requested_at,history_sync_progress,
  history_sync_declined) on public.whatsapp_accounts to authenticated;

-- Same as 20261009155330, plus: a different number starts with no import state, as it starts with no reception.
create or replace function public.configure_whatsapp_cloud(
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
      then whatsapp_accounts.last_webhook_at else null end,
    app_linked_at=case when whatsapp_accounts.phone_number_id=excluded.phone_number_id
      then whatsapp_accounts.app_linked_at else null end,
    contacts_sync_requested_at=case when whatsapp_accounts.phone_number_id=excluded.phone_number_id
      then whatsapp_accounts.contacts_sync_requested_at else null end,
    history_sync_requested_at=case when whatsapp_accounts.phone_number_id=excluded.phone_number_id
      then whatsapp_accounts.history_sync_requested_at else null end,
    history_sync_progress=case when whatsapp_accounts.phone_number_id=excluded.phone_number_id
      then whatsapp_accounts.history_sync_progress else null end,
    history_sync_declined=case when whatsapp_accounts.phone_number_id=excluded.phone_number_id
      then whatsapp_accounts.history_sync_declined else false end
  returning id into account_id;
  return account_id;
end;
$$;
revoke all on function public.configure_whatsapp_cloud(uuid,uuid,text,text,text,text)
  from public,anon,authenticated;
grant execute on function public.configure_whatsapp_cloud(uuid,uuid,text,text,text,text) to service_role;

-- Imported chats: Meta may deliver a chunk twice and the message index is partial, which PostgREST
-- upserts cannot target. Each message is stored once, only in a conversation of the same business;
-- a media placeholder is completed when Meta sends that media in a later chunk.
create function public.nexo_import_whatsapp_history(p_tenant uuid, p_rows jsonb)
returns integer language sql security invoker set search_path='' as $$
  with incoming as (
    select (r->>'conversation_id')::uuid conversation_id, (r->>'direction')::public.message_direction direction,
      (r->>'sender')::public.message_sender sender, (r->>'type')::public.message_type type,
      r->>'body' body, r->>'media_url' media_url, r->>'wa_message_id' wa_message_id, r->'raw' raw,
      (r->>'created_at')::timestamptz created_at
    from jsonb_array_elements(p_rows) r
  ), saved as (
    insert into public.messages as m(tenant_id,conversation_id,direction,sender,type,body,media_url,wa_message_id,raw,created_at)
    select p_tenant,i.conversation_id,i.direction,i.sender,i.type,i.body,i.media_url,i.wa_message_id,i.raw,i.created_at
    from incoming i join public.conversations c on c.id=i.conversation_id and c.tenant_id=p_tenant
    where i.wa_message_id is not null
    on conflict (wa_message_id) where wa_message_id is not null do update set
      type=excluded.type, body=coalesce(excluded.body,m.body),
      media_url=coalesce(excluded.media_url,m.media_url), raw=excluded.raw
    where m.tenant_id=excluded.tenant_id
      and m.raw->>'type'='media_placeholder' and excluded.raw->>'type'<>'media_placeholder'
    returning 1
  )
  select count(*)::integer from saved;
$$;
revoke all on function public.nexo_import_whatsapp_history(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.nexo_import_whatsapp_history(uuid,jsonb) to service_role;
-- SECURITY INVOKER needs explicit privileges, in addition to BYPASSRLS.
grant select, insert, update on public.messages to service_role;
grant select on public.conversations to service_role;
