-- Customer-declared commercial preferences are separate from private CRM notes.
-- One bounded value per category, never a free-form instruction/memory prompt.
create table public.customer_sales_memory (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  category text not null check (category in ('product_color','product_size','product_category','contact_format','language')),
  value text not null check (length(value) between 1 and 60),
  source_conversation_id uuid not null references public.conversations(id) on delete cascade,
  source_message_id uuid not null references public.messages(id) on delete cascade,
  evidence_quote text not null check (length(evidence_quote) between 4 and 160),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  deleted_at timestamptz,
  deleted_source_message_id uuid references public.messages(id) on delete set null,
  deleted_evidence_quote text check (length(deleted_evidence_quote) between 4 and 160),
  unique(tenant_id,customer_id,category)
);
create index customer_sales_memory_source_message on public.customer_sales_memory(source_message_id);
create index customer_sales_memory_source_conversation on public.customer_sales_memory(source_conversation_id);
create index customer_sales_memory_deleted_source on public.customer_sales_memory(deleted_source_message_id);
create index orders_customer_history on public.orders(tenant_id,customer_id,created_at desc)
  where payment_status='paid' and status in ('confirmed','shipped','delivered');
alter table public.customer_sales_memory enable row level security;
revoke all on public.customer_sales_memory from public,anon,authenticated;
grant select on public.customer_sales_memory to authenticated;
grant all on public.customer_sales_memory to service_role;
create policy customer_sales_memory_members_read on public.customer_sales_memory for select to authenticated
  using (public.is_tenant_member(tenant_id));

-- Server-only helper validates the exact current inbound message and serializes
-- preference changes for one customer even if two conversations run concurrently.
create or replace function public.nexo_customer_memory_evidence(p_tenant uuid,p_conversation uuid,p_customer uuid,p_trigger uuid,p_quote text)
returns text language plpgsql security invoker set search_path = '' as $$
declare m public.messages%rowtype; current_id uuid; canonical text; quote_text text; current_mode public.agent_mode;
begin
  perform 1 from public.customers where id=p_customer and tenant_id=p_tenant for update;
  if not found or not exists(select 1 from public.conversations where id=p_conversation and tenant_id=p_tenant
    and customer_id=p_customer and status='open') then raise exception 'MEMORY_CUSTOMER_SCOPE'; end if;
  select mode into current_mode from public.agents where tenant_id=p_tenant and active=true order by created_at desc limit 1 for share;
  if current_mode is distinct from 'autonomous'::public.agent_mode then raise exception 'MEMORY_NOT_AUTONOMOUS'; end if;
  if p_quote is null or length(p_quote) not between 4 and 160 then raise exception 'MEMORY_EVIDENCE_REQUIRED'; end if;
  select * into m from public.messages where id=p_trigger and tenant_id=p_tenant and conversation_id=p_conversation
    and direction='inbound' and sender='customer' and type in ('text','audio');
  if not found or m.created_at<clock_timestamp()-interval '1 hour' or m.created_at>clock_timestamp()+interval '1 minute'
    then raise exception 'MEMORY_EVIDENCE_REQUIRED'; end if;
  select id into current_id from public.messages where tenant_id=p_tenant and conversation_id=p_conversation
    and direction='inbound' and sender='customer' order by created_at desc,id desc limit 1;
  if current_id is distinct from p_trigger then raise exception 'MEMORY_EVIDENCE_NOT_CURRENT'; end if;
  canonical:=case when m.type='audio' then nullif(btrim(m.transcript),'') else m.body end;
  quote_text:=btrim(p_quote);
  if canonical is null or position(quote_text in canonical)=0 then raise exception 'MEMORY_EVIDENCE_NOT_LITERAL'; end if;
  quote_text:=btrim(quote_text,E' .!?\n\r');
  -- Full sentence evidence: the model cannot cut a denial or an instruction out.
  if not exists(select 1 from regexp_split_to_table(canonical,E'[.!?\n\r]+') sentence
    where btrim(sentence)=quote_text) then raise exception 'MEMORY_EVIDENCE_NOT_SENTENCE'; end if;
  return translate(lower(quote_text),'áéíóúüñ','aeiouun');
end $$;

create or replace function public.nexo_get_customer_sales_context(p_tenant uuid,p_conversation uuid,p_customer uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare prefs jsonb; purchases jsonb;
begin
  if not exists(select 1 from public.customers where id=p_customer and tenant_id=p_tenant)
    or not exists(select 1 from public.conversations where id=p_conversation and tenant_id=p_tenant and customer_id=p_customer)
    then raise exception 'MEMORY_CUSTOMER_SCOPE'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('category',category,'value',value,'updated_at',updated_at) order by category),'[]'::jsonb)
    into prefs from public.customer_sales_memory where tenant_id=p_tenant and customer_id=p_customer and deleted_at is null;
  select coalesce(jsonb_agg(jsonb_build_object('ordered_at',o.created_at,'status',o.status,'total',o.total,'items',
    (select coalesce(jsonb_agg(jsonb_build_object('name',left(i.name_snapshot,160),'qty',i.qty) order by i.id),'[]'::jsonb)
      from (select id,name_snapshot,qty from public.order_items where tenant_id=p_tenant and order_id=o.id order by id limit 10) i))
    order by o.created_at desc,o.id),'[]'::jsonb)
    into purchases from (select id,created_at,status,total from public.orders where tenant_id=p_tenant and customer_id=p_customer
      and payment_status='paid' and status in ('confirmed','shipped','delivered') order by created_at desc,id desc limit 5) o;
  return jsonb_build_object('preferences',prefs,'purchases',purchases);
end $$;

create or replace function public.nexo_remember_customer_preference(p_tenant uuid,p_conversation uuid,p_customer uuid,p_trigger uuid,
  p_category text,p_value text,p_quote text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare quote_text text; v text; normal_value text; incoming_text text; valid boolean:=false;
begin
  quote_text:=public.nexo_customer_memory_evidence(p_tenant,p_conversation,p_customer,p_trigger,p_quote);
  select translate(lower(case when type='audio' then transcript else body end),'áéíóúüñ','aeiouun') into incoming_text
    from public.messages where id=p_trigger and tenant_id=p_tenant and conversation_id=p_conversation;
  if incoming_text ~ 'no[[:space:]]+(guardes|recuerdes|almacenes|memorices|conserves)'
    then raise exception 'MEMORY_CUSTOMER_OPT_OUT'; end if;
  v:=btrim(p_value); normal_value:=translate(lower(v),'áéíóúüñ','aeiouun');
  if v is null or length(v) not between 1 and 60 then raise exception 'MEMORY_INVALID_PREFERENCE'; end if;
  if normal_value ~ '(ignora|instruccion|prompt|sistema|reglas|contrasena|password|token|secreto|clave|correo|telefono|bancaria|salud|religion|politic|sexual)'
    then raise exception 'MEMORY_INVALID_PREFERENCE'; end if;
  if quote_text like 'recuerda que %' then quote_text:=substr(quote_text,14); end if;
  case p_category
    when 'product_color' then
      valid:=normal_value=any(array['negro','negra','blanco','blanca','azul','rojo','roja','verde','amarillo','amarilla','morado','morada',
        'violeta','rosado','rosada','rosa','gris','beige','cafe','marron','naranja','dorado','dorada','plateado','plateada'])
        and quote_text=any(array['prefiero el color '||normal_value,'me gusta el color '||normal_value,'mi color preferido es '||normal_value]);
    when 'product_size' then
      valid:=normal_value ~ '^(xxs|xs|s|m|l|xl|xxl|xxxl|unica|[2-5][0-9])$'
        and quote_text=any(array['mi talla es '||normal_value,'uso talla '||normal_value,'prefiero la talla '||normal_value]);
    when 'product_category' then
      select category into v from public.products where tenant_id=p_tenant and active=true and category is not null
        and translate(lower(category),'áéíóúüñ','aeiouun')=normal_value and length(category)<=60 order by category limit 1;
      valid:=found and normal_value ~ '^[a-z ]+$'
        and quote_text=any(array['prefiero la categoria '||normal_value,'mi categoria preferida es '||normal_value]);
    when 'contact_format' then
      valid:=normal_value in ('texto','audio') and quote_text=any(array['prefiero mensajes de '||normal_value,'prefiero que me respondas con '||normal_value]);
    when 'language' then
      valid:=normal_value in ('espanol','ingles') and quote_text=any(array['prefiero que me respondas en '||normal_value,'prefiero hablar en '||normal_value]);
    else raise exception 'MEMORY_INVALID_PREFERENCE';
  end case;
  if valid is distinct from true then raise exception 'MEMORY_EXPLICIT_COMMERCIAL_PREFERENCE_REQUIRED'; end if;
  -- Five fixed categories bound persistent storage; updates replace one category.
  insert into public.customer_sales_memory(tenant_id,customer_id,category,value,source_conversation_id,source_message_id,evidence_quote)
    values(p_tenant,p_customer,p_category,v,p_conversation,p_trigger,btrim(p_quote))
    on conflict(tenant_id,customer_id,category) do update set value=excluded.value,source_conversation_id=excluded.source_conversation_id,
      source_message_id=excluded.source_message_id,evidence_quote=excluded.evidence_quote,updated_at=clock_timestamp(),
      deleted_at=null,deleted_source_message_id=null,deleted_evidence_quote=null;
  return jsonb_build_object('remembered',true,'category',p_category,'value',v);
end $$;

create or replace function public.nexo_forget_customer_preference(p_tenant uuid,p_conversation uuid,p_customer uuid,p_trigger uuid,p_category text,p_quote text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare quote_text text; subject text; changed integer;
begin
  quote_text:=public.nexo_customer_memory_evidence(p_tenant,p_conversation,p_customer,p_trigger,p_quote);
  subject:=case p_category when 'product_color' then 'mi preferencia de color' when 'product_size' then 'mi talla'
    when 'product_category' then 'mi categoria preferida' when 'contact_format' then 'mi formato de mensajes'
    when 'language' then 'mi idioma preferido' when 'all' then 'mis preferencias' end;
  if subject is null or quote_text<>all(array['olvida '||subject,'borra '||subject,'elimina '||subject,'no recuerdes '||subject])
    then raise exception 'MEMORY_EXPLICIT_FORGET_REQUEST_REQUIRED'; end if;
  update public.customer_sales_memory set deleted_at=clock_timestamp(),updated_at=clock_timestamp(),
    deleted_source_message_id=p_trigger,deleted_evidence_quote=btrim(p_quote)
    where tenant_id=p_tenant and customer_id=p_customer and deleted_at is null and (p_category='all' or category=p_category);
  get diagnostics changed=row_count;
  return jsonb_build_object('forgotten',true,'category',p_category,'count',changed);
end $$;

revoke all on function public.nexo_customer_memory_evidence(uuid,uuid,uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.nexo_get_customer_sales_context(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.nexo_remember_customer_preference(uuid,uuid,uuid,uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.nexo_forget_customer_preference(uuid,uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.nexo_customer_memory_evidence(uuid,uuid,uuid,uuid,text) to service_role;
grant execute on function public.nexo_get_customer_sales_context(uuid,uuid,uuid) to service_role;
grant execute on function public.nexo_remember_customer_preference(uuid,uuid,uuid,uuid,text,text,text) to service_role;
grant execute on function public.nexo_forget_customer_preference(uuid,uuid,uuid,uuid,text,text) to service_role;
