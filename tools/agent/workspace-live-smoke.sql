-- Synthetic fixtures only; no customer data, external messages or model calls.
begin;
do $$
declare u uuid; outsider uuid; t uuid=gen_random_uuid(); other_t uuid=gen_random_uuid(); m jsonb; task jsonb;
begin
  select id into u from auth.users order by id limit 1;
  select id into outsider from auth.users where id<>u order by id limit 1;
  if u is null or outsider is null then raise exception 'Need two existing auth users for rollback smoke'; end if;
  insert into public.tenants(id,name,slug) values(t,'Synthetic memory smoke',t::text),(other_t,'Synthetic isolation smoke',other_t::text);
  insert into public.tenant_members(tenant_id,user_id,role) values(t,u,'owner'),(other_t,outsider,'owner');
  m=public.nexo_propose_work(other_t,outsider,null,gen_random_uuid(),'{"kind":"memory","title":"Foreign synthetic fact","body":"Must stay isolated"}');
  perform public.nexo_change_work(other_t,outsider,(m->>'id')::uuid,1,'confirm');
  m=public.nexo_propose_work(t,u,null,gen_random_uuid(),'{"kind":"memory","title":"Synthetic fact","body":"Test fixture only"}');
  if m->>'status'<>'proposed' then raise exception 'proposal state'; end if;
  m=public.nexo_change_work(t,u,(m->>'id')::uuid,1,'confirm');
  if m->>'status'<>'active' or m->>'confirmed_by'<>u::text then raise exception 'confirmation state'; end if;
  task=public.nexo_propose_work(t,u,null,gen_random_uuid(),jsonb_build_object('kind','task','title','Synthetic reminder','due_at',now()+interval '5 minutes','timezone','America/Bogota'));
  task=public.nexo_change_work(t,u,(task->>'id')::uuid,1,'confirm');
  update public.nexo_work_items set due_at=now()-interval '1 minute' where id=(task->>'id')::uuid and tenant_id=t;
  perform public.nexo_enqueue_task_reminders();
  perform public.nexo_enqueue_task_reminders();
  if (select count(*) from public.nexo_task_reminders where item_id=(task->>'id')::uuid and user_id=u)<>1 then raise exception 'reminder idempotency'; end if;
  if has_function_privilege('authenticated','public.nexo_change_work(uuid,uuid,uuid,integer,text,jsonb)','execute')
    or has_function_privilege('anon','public.nexo_propose_work(uuid,uuid,text,uuid,jsonb)','execute') then raise exception 'RPC grants'; end if;
  perform set_config('nexo.smoke_tenant',t::text,true);
  perform set_config('nexo.smoke_other',other_t::text,true);
  perform set_config('request.jwt.claim.sub',u::text,true);
end $$;
set local role authenticated;
do $$ begin
  if (select count(*) from public.nexo_work_items where tenant_id=current_setting('nexo.smoke_tenant')::uuid)<>2 then raise exception 'own tenant read'; end if;
  if (select count(*) from public.nexo_work_items where tenant_id=current_setting('nexo.smoke_other')::uuid)<>0 then raise exception 'foreign tenant read'; end if;
end $$;
reset role;
rollback;
select true as rollback_smoke_passed;
