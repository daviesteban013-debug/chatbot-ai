-- Synthetic configuration only. No real tokens, numbers or Meta calls.
begin;
do $test$
declare
  ta uuid := gen_random_uuid(); tb uuid := gen_random_uuid();
  ua uuid; ub uuid; n integer; blocked boolean := false;
  phone text := '999' || (floor(random()*1000000000000000)::bigint)::text;
  cipher text := 'wa.v1.' || repeat('a',16) || '.' || repeat('b',22) || '.' || repeat('c',40);
begin
  select id into ua from auth.users order by id limit 1;
  select id into ub from auth.users where id<>ua order by id limit 1;
  if ua is null or ub is null then raise exception 'SMOKE_REQUIRES_TWO_USERS'; end if;
  insert into public.tenants(id,name,slug) values
    (ta,'WhatsApp rollback-only test','wa-smoke-'||ta),
    (tb,'WhatsApp rollback-only test','wa-smoke-'||tb);
  insert into public.tenant_members(tenant_id,user_id,role) values (ta,ua,'owner'),(tb,ub,'owner');
  set local role service_role;
  perform public.configure_whatsapp_cloud(ta,ua,phone,'9999999999999999','Synthetic fixture',cipher);
  begin
    perform public.configure_whatsapp_cloud(tb,ub,phone,'9999999999999999','Synthetic fixture',cipher);
  exception when unique_violation then blocked := true;
  end;
  if not blocked then raise exception 'PHONE_REBIND_NOT_REJECTED'; end if;
  reset role;
  perform set_config('request.jwt.claim.sub',ua::text,true);
  set local role authenticated;
  select count(*) into n from public.whatsapp_accounts where tenant_id=ta;
  if n<>1 then raise exception 'OWNER_METADATA_NOT_READABLE'; end if;
  select count(*) into n from public.whatsapp_accounts where tenant_id=tb;
  if n<>0 then raise exception 'TENANT_ISOLATION_FAILED'; end if;
  blocked := false;
  begin
    perform access_token_enc from public.whatsapp_accounts;
  exception when insufficient_privilege then blocked := true;
  end;
  if not blocked then raise exception 'TOKEN_COLUMN_EXPOSED'; end if;
  reset role;
end;
$test$;
rollback;
select 'passed' as live_whatsapp_smoke, 'service_rpc, phone_uniqueness, tenant_rls, token_column_denied' as checks, 'rolled_back' as synthetic_data;
