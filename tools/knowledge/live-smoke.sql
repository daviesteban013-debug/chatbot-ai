-- Run only against the intended Supabase project using a trusted SQL connection.
-- Synthetic fixtures use two existing accounts; all writes are rolled back.
begin;
do $test$
declare
  ta uuid := gen_random_uuid(); tb uuid := gen_random_uuid();
  sa uuid := gen_random_uuid(); sb uuid := gen_random_uuid();
  ua uuid; ub uuid; found_count integer; blocked boolean := false;
  vec extensions.vector := ('[1,' || repeat('0,',1534) || '0]')::extensions.vector;
begin
  select id into ua from auth.users order by id limit 1;
  select id into ub from auth.users where id <> ua order by id limit 1;
  if ua is null or ub is null then raise exception 'SMOKE_REQUIRES_TWO_EXISTING_USERS'; end if;
  insert into public.tenants(id,name,slug) values
    (ta,'RAG rollback-only test','rag-smoke-'||ta),
    (tb,'RAG rollback-only test','rag-smoke-'||tb);
  insert into public.tenant_members(tenant_id,user_id,role) values (ta,ua,'owner'),(tb,ub,'owner');
  insert into public.knowledge_sources(id,tenant_id,name,kind,status) values
    (sa,ta,'Synthetic A','manual','ready'),(sb,tb,'Synthetic B','manual','ready');
  insert into public.knowledge_chunks(tenant_id,source_id,chunk_index,content,embedding) values
    (ta,sa,0,'Synthetic A',vec),(tb,sb,0,'Synthetic B',vec);
  perform set_config('request.jwt.claim.sub',ua::text,true);
  set local role authenticated;
  select count(*) into found_count from public.knowledge_chunks where tenant_id=tb;
  if found_count <> 0 then raise exception 'RAG_ISOLATION_FAILED'; end if;
  select count(*) into found_count from public.match_knowledge_chunks(ta,vec,5,0.5) where source_id=sa and similarity>0.99;
  if found_count <> 1 then raise exception 'RAG_RETRIEVAL_FAILED'; end if;
  begin
    perform * from public.match_knowledge_chunks(tb,vec,5,0.5);
  exception when insufficient_privilege then blocked := true;
  end;
  if not blocked then raise exception 'RAG_FORGED_TENANT_NOT_REJECTED'; end if;
  reset role;
  update public.knowledge_sources set status='archived' where id=sa;
  set local role authenticated;
  select count(*) into found_count from public.match_knowledge_chunks(ta,vec,5,0.5);
  if found_count <> 0 then raise exception 'RAG_ARCHIVED_SOURCE_RETRIEVED'; end if;
  reset role;
end;
$test$;
rollback;
select 'passed' as live_rag_smoke, 'raw_rls, cosine_retrieval, forged_tenant, archived_source' as checks, 'rolled_back' as synthetic_data;
