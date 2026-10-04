-- =====================================================================
-- Migración 004: Sesiones y mensajes web para el asistente Jarvis 3D.
-- Permite persistir el historial interactivo en tiempo real tanto para
-- usuarios autenticados (vinculados a tenant / user_id) como visitantes
-- web con session_id.
-- =====================================================================

create table if not exists jarvis_sessions (
  id          uuid primary key default gen_random_uuid(),
  session_id  text not null unique,
  user_id     uuid references auth.users(id) on delete set null,
  tenant_id   uuid references tenants(id) on delete cascade,
  title       text not null default 'Conversación con Jarvis',
  status      text not null default 'active',
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists jarvis_sessions_session_id_idx on jarvis_sessions (session_id);
create index if not exists jarvis_sessions_user_id_idx on jarvis_sessions (user_id);
create index if not exists jarvis_sessions_tenant_id_idx on jarvis_sessions (tenant_id);

create table if not exists jarvis_messages (
  id          uuid primary key default gen_random_uuid(),
  session_id  text not null references jarvis_sessions(session_id) on delete cascade,
  role        text not null check (role in ('user', 'assistant', 'system')),
  content     text not null,
  tokens_in   integer not null default 0,
  tokens_out  integer not null default 0,
  latency_ms  integer not null default 0,
  status      text not null default 'completed' check (status in ('processing', 'streaming', 'completed', 'error')),
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists jarvis_messages_session_created_idx
  on jarvis_messages (session_id, created_at asc);

-- Función y trigger para actualizar updated_at en jarvis_sessions
create or replace function update_jarvis_session_timestamp()
returns trigger as $$
begin
  update jarvis_sessions
  set updated_at = now()
  where session_id = new.session_id;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_update_jarvis_session_timestamp on jarvis_messages;
create trigger trg_update_jarvis_session_timestamp
  after insert on jarvis_messages
  for each row
  execute function update_jarvis_session_timestamp();

-- RLS (Row Level Security)
alter table jarvis_sessions enable row level security;
alter table jarvis_messages enable row level security;

-- Políticas para jarvis_sessions:
-- 1. Usuarios autenticados pueden ver y crear sus propias sesiones
create policy "jarvis_sessions_auth_user_select" on jarvis_sessions
  for select using (auth.uid() = user_id or user_id is null);

create policy "jarvis_sessions_auth_user_insert" on jarvis_sessions
  for insert with check (auth.uid() = user_id or user_id is null);

create policy "jarvis_sessions_auth_user_update" on jarvis_sessions
  for update using (auth.uid() = user_id or user_id is null);

-- 2. Políticas para jarvis_messages:
create policy "jarvis_messages_select" on jarvis_messages
  for select using (
    exists (
      select 1 from jarvis_sessions s
      where s.session_id = jarvis_messages.session_id
        and (s.user_id = auth.uid() or s.user_id is null)
    )
  );

create policy "jarvis_messages_insert" on jarvis_messages
  for insert with check (
    exists (
      select 1 from jarvis_sessions s
      where s.session_id = jarvis_messages.session_id
    )
  );
