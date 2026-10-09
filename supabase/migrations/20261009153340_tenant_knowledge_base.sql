-- RAG foundation. Agent identity stays in agents / jarvis_configs.
-- Personal jarvis_files are NOT implicitly shared with a tenant.
create schema if not exists extensions;
create extension if not exists vector with schema extensions;
grant usage on schema extensions to authenticated, service_role;

create table public.knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null check (char_length(btrim(name)) > 0 and char_length(name) <= 200),
  kind text not null check (kind in ('manual', 'file')),
  status text not null default 'draft'
    check (status in ('draft', 'indexing', 'ready', 'failed', 'archived')),
  embedding_model text not null default 'text-embedding-3-small'
    check (embedding_model = 'text-embedding-3-small'),
  revision integer not null default 1 check (revision > 0),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id)
);
create index knowledge_sources_tenant_status_idx on public.knowledge_sources (tenant_id, status);

create table public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  source_id uuid not null,
  revision integer not null default 1 check (revision > 0),
  chunk_index integer not null check (chunk_index >= 0),
  content text not null check (char_length(btrim(content)) > 0 and char_length(content) <= 6000),
  embedding extensions.vector(1536) not null check (extensions.vector_norm(embedding) > 0),
  page_number integer check (page_number > 0),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
  created_at timestamptz not null default now(),
  foreign key (source_id, tenant_id) references public.knowledge_sources(id, tenant_id) on delete cascade,
  unique (source_id, revision, chunk_index)
);
create index knowledge_chunks_tenant_idx on public.knowledge_chunks (tenant_id);
create index knowledge_chunks_source_tenant_idx on public.knowledge_chunks (source_id, tenant_id);
create index knowledge_chunks_embedding_hnsw_idx on public.knowledge_chunks
  using hnsw (embedding extensions.vector_cosine_ops);

create function public.knowledge_preserve_identity()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.id is distinct from old.id or new.tenant_id is distinct from old.tenant_id then
    raise exception 'KNOWLEDGE_IDENTITY_IMMUTABLE' using errcode = '23514';
  end if;
  if tg_table_name = 'knowledge_chunks' then
    if new.source_id is distinct from old.source_id
       or new.revision is distinct from old.revision
       or new.chunk_index is distinct from old.chunk_index then
      raise exception 'KNOWLEDGE_IDENTITY_IMMUTABLE' using errcode = '23514';
    end if;
  else
    if new.revision < old.revision then
      raise exception 'KNOWLEDGE_REVISION_REGRESSION' using errcode = '23514';
    end if;
    new.updated_at := now();
  end if;
  return new;
end;
$$;
revoke all on function public.knowledge_preserve_identity() from public, anon, authenticated;
create trigger knowledge_sources_preserve_identity before update on public.knowledge_sources
  for each row execute function public.knowledge_preserve_identity();
create trigger knowledge_chunks_preserve_identity before update on public.knowledge_chunks
  for each row execute function public.knowledge_preserve_identity();

alter table public.knowledge_sources enable row level security;
alter table public.knowledge_chunks enable row level security;
create policy knowledge_sources_member_read on public.knowledge_sources
  for select to authenticated using (
    tenant_id in (select m.tenant_id from public.tenant_members m where m.user_id = (select auth.uid()))
  );
create policy knowledge_chunks_member_read on public.knowledge_chunks
  for select to authenticated using (
    tenant_id in (select m.tenant_id from public.tenant_members m where m.user_id = (select auth.uid()))
  );
-- Browsers may read their business knowledge. Only the trusted ingestion
-- backend may write, AFTER validating membership, document ownership and quotas.
revoke all on public.knowledge_sources, public.knowledge_chunks from public, anon, authenticated;
grant select on public.knowledge_sources, public.knowledge_chunks to authenticated;
grant all on public.knowledge_sources, public.knowledge_chunks to service_role;

create function public.match_knowledge_chunks(
  p_tenant_id uuid,
  p_embedding extensions.vector,
  p_limit integer default 5,
  p_min_similarity double precision default 0.5
)
returns table (
  id uuid, source_id uuid, source_name text, revision integer,
  chunk_index integer, content text, page_number integer, metadata jsonb,
  similarity double precision
)
language plpgsql stable security invoker
set search_path = ''
set hnsw.iterative_scan = 'strict_order'
set hnsw.ef_search = '80'
as $$
begin
  if (select auth.uid()) is null or not exists (
    select 1 from public.tenant_members m
    where m.tenant_id = p_tenant_id and m.user_id = (select auth.uid())
  ) then
    raise exception 'KNOWLEDGE_FORBIDDEN' using errcode = '42501';
  end if;
  if p_embedding is null or extensions.vector_dims(p_embedding) <> 1536
     or extensions.vector_norm(p_embedding) = 0
     or p_limit is null or p_limit not between 1 and 10
     or p_min_similarity is null or p_min_similarity not between 0 and 1 then
    raise exception 'KNOWLEDGE_INVALID_QUERY' using errcode = '22023';
  end if;
  return query
    select c.id, c.source_id, s.name, c.revision, c.chunk_index, c.content,
           c.page_number, c.metadata,
           1 - (c.embedding operator(extensions.<=>) p_embedding) as similarity
    from public.knowledge_chunks c
    join public.knowledge_sources s on s.id = c.source_id and s.tenant_id = c.tenant_id
    where c.tenant_id = p_tenant_id and s.status = 'ready' and c.revision = s.revision
      and (c.embedding operator(extensions.<=>) p_embedding) <= 1 - p_min_similarity
    order by c.embedding operator(extensions.<=>) p_embedding
    limit p_limit;
end;
$$;
-- Intentionally authenticated-only: service_role bypasses RLS and is not the
-- retrieval identity. Webhooks will need a separately authorized adapter.
revoke all on function public.match_knowledge_chunks(uuid, extensions.vector, integer, double precision)
  from public, anon, authenticated, service_role;
grant execute on function public.match_knowledge_chunks(uuid, extensions.vector, integer, double precision)
  to authenticated;
