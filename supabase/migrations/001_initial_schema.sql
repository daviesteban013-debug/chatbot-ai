-- =====================================================================
-- Esquema V1: agente vendedor por WhatsApp (commerce de productos, Colombia)
-- Postgres / Supabase. Multi-tenant: TODA tabla de negocio lleva tenant_id.
-- El webhook y el agente usan service role (saltan RLS); el dashboard usa RLS.
-- Dinero: pesos colombianos (COP) como integer, sin decimales.
-- Telefonos: formato E.164 (+573001234567).
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Enums ----------
create type agent_mode          as enum ('shadow', 'copilot', 'autonomous');
create type conversation_status as enum ('open', 'handoff', 'closed');
create type message_direction   as enum ('inbound', 'outbound');
create type message_sender      as enum ('customer', 'agent', 'human');
create type message_type        as enum ('text', 'audio', 'image', 'document', 'other');
create type order_type          as enum ('retail', 'wholesale');
create type order_status        as enum ('draft', 'pending_approval', 'pending_payment', 'confirmed', 'shipped', 'delivered', 'canceled');
create type payment_method      as enum ('contraentrega', 'transferencia', 'nequi', 'daviplata', 'bancolombia', 'pse', 'otro');
create type payment_status      as enum ('pending', 'paid', 'failed', 'refunded');
create type handoff_reason      as enum ('reclamo', 'negociacion', 'incertidumbre', 'fuera_de_catalogo', 'solicitud_cliente', 'pedido_alto_valor', 'otro');
create type handoff_status      as enum ('open', 'taken', 'resolved');
create type run_status          as enum ('sent', 'proposed', 'approved', 'edited', 'rejected', 'error');

-- ---------- Tenants y usuarios ----------
create table tenants (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  plan        text not null default 'pilot',
  status      text not null default 'active',
  created_at  timestamptz not null default now()
);

create table tenant_members (
  tenant_id   uuid not null references tenants(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null default 'owner' check (role in ('owner', 'agent', 'viewer')),
  primary key (tenant_id, user_id)
);

-- ---------- WhatsApp ----------
create table whatsapp_accounts (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenants(id) on delete cascade,
  phone_number_id  text not null unique,
  waba_id          text,
  display_phone    text,
  access_token_enc text,
  created_at       timestamptz not null default now()
);

-- ---------- Agente ----------
create table agents (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenants(id) on delete cascade,
  name             text not null default 'Asistente',
  tone             text not null default 'amable',
  system_prompt    text not null default '',
  business_rules   jsonb not null default '{}'::jsonb,
  mode             agent_mode not null default 'shadow',
  model            text not null default 'qwen-max',
  auto_confirm_max_total integer not null default 0,
  max_discount_pct numeric(5,2) not null default 0,
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ---------- Catalogo ----------
create table products (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references tenants(id) on delete cascade,
  sku                 text not null,
  name                text not null,
  description         text,
  category            text,
  price_retail        integer not null check (price_retail >= 0),
  price_wholesale     integer check (price_wholesale >= 0),
  wholesale_min_qty   integer,
  active              boolean not null default true,
  created_at          timestamptz not null default now(),
  unique (tenant_id, sku)
);

create table product_variants (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants(id) on delete cascade,
  product_id     uuid not null references products(id) on delete cascade,
  sku            text not null,
  color          text,
  size           text,
  price_override integer check (price_override >= 0),
  stock_qty      integer not null default 0 check (stock_qty >= 0),
  reserved_qty   integer not null default 0 check (reserved_qty >= 0),
  image_url      text,
  active         boolean not null default true,
  unique (tenant_id, sku),
  check (reserved_qty <= stock_qty)
);
create index on product_variants (tenant_id, product_id);

-- ---------- Clientes y conversaciones ----------
create table customers (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  phone       text not null,
  name        text,
  city        text,
  notes       text,
  created_at  timestamptz not null default now(),
  unique (tenant_id, phone)
);

create table conversations (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenants(id) on delete cascade,
  customer_id      uuid not null references customers(id) on delete cascade,
  status           conversation_status not null default 'open',
  assigned_to      uuid references auth.users(id),
  last_message_at  timestamptz not null default now(),
  created_at       timestamptz not null default now()
);
create index on conversations (tenant_id, status, last_message_at desc);

create table messages (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenants(id) on delete cascade,
  conversation_id  uuid not null references conversations(id) on delete cascade,
  direction        message_direction not null,
  sender           message_sender not null,
  type             message_type not null default 'text',
  body             text,
  media_url        text,
  transcript       text,
  wa_message_id    text,
  raw              jsonb,
  created_at       timestamptz not null default now()
);
create unique index messages_wa_message_id_uniq on messages (wa_message_id) where wa_message_id is not null;
create index on messages (conversation_id, created_at);

-- ---------- Pedidos ----------
create table orders (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references tenants(id) on delete cascade,
  conversation_id       uuid references conversations(id) on delete set null,
  customer_id           uuid not null references customers(id),
  order_type            order_type not null default 'retail',
  status                order_status not null default 'draft',
  subtotal              integer not null default 0,
  discount              integer not null default 0,
  shipping_cost         integer not null default 0,
  total                 integer not null default 0,
  payment_method        payment_method,
  payment_status        payment_status not null default 'pending',
  recipient_name        text,
  recipient_phone       text,
  shipping_department   text,
  shipping_city         text,
  shipping_neighborhood text,
  shipping_address      text,
  shipping_notes        text,
  carrier               text,
  tracking_code         text,
  created_by            message_sender not null default 'agent',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index on orders (tenant_id, status, created_at desc);

create table order_items (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants(id) on delete cascade,
  order_id       uuid not null references orders(id) on delete cascade,
  variant_id     uuid not null references product_variants(id),
  name_snapshot  text not null,
  qty            integer not null check (qty > 0),
  unit_price     integer not null check (unit_price >= 0)
);

-- ---------- Handoff ----------
create table handoffs (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenants(id) on delete cascade,
  conversation_id  uuid not null references conversations(id) on delete cascade,
  reason           handoff_reason not null,
  summary          text not null,
  priority         text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  status           handoff_status not null default 'open',
  taken_by         uuid references auth.users(id),
  created_at       timestamptz not null default now(),
  resolved_at      timestamptz
);

-- ---------- Observabilidad del agente ----------
create table agent_runs (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenants(id) on delete cascade,
  conversation_id  uuid not null references conversations(id) on delete cascade,
  trigger_message_id uuid references messages(id),
  mode             agent_mode not null,
  proposed_reply   text,
  final_reply      text,
  tool_calls       jsonb not null default '[]'::jsonb,
  model            text,
  tokens_in        integer,
  tokens_out       integer,
  cost_usd         numeric(10,6),
  latency_ms       integer,
  status           run_status not null,
  error            text,
  created_at       timestamptz not null default now()
);
create index on agent_runs (tenant_id, created_at desc);

-- ---------- Evaluacion ----------
create table eval_cases (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  name          text not null,
  transcript    jsonb not null,
  expected      jsonb not null,
  created_at    timestamptz not null default now()
);

create table eval_results (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  eval_case_id  uuid not null references eval_cases(id) on delete cascade,
  model         text,
  passed        boolean not null,
  diff          jsonb,
  cost_usd      numeric(10,6),
  created_at    timestamptz not null default now()
);

-- ---------- Reserva atomica de stock ----------
create or replace function reserve_variant_stock(p_variant uuid, p_qty integer)
returns boolean language plpgsql as $$
declare ok boolean;
begin
  update product_variants
     set reserved_qty = reserved_qty + p_qty
   where id = p_variant and active and (stock_qty - reserved_qty) >= p_qty
  returning true into ok;
  return coalesce(ok, false);
end $$;

create or replace function release_variant_stock(p_variant uuid, p_qty integer)
returns void language sql as $$
  update product_variants
     set reserved_qty = greatest(reserved_qty - p_qty, 0)
   where id = p_variant;
$$;

-- ---------- RLS ----------
create or replace function is_tenant_member(t uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from tenant_members m where m.tenant_id = t and m.user_id = auth.uid());
$$;

alter table tenants enable row level security;
create policy tenants_select on tenants for select using (is_tenant_member(id));

alter table tenant_members enable row level security;
create policy tenant_members_select_own on tenant_members for select using (user_id = auth.uid());

do $$
declare t text;
begin
  foreach t in array array[
    'whatsapp_accounts','agents','products','product_variants','customers',
    'conversations','messages','orders','order_items','handoffs',
    'agent_runs','eval_cases','eval_results'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy %I on %I for all using (is_tenant_member(tenant_id)) with check (is_tenant_member(tenant_id))',
      t || '_tenant_all', t
    );
  end loop;
end $$;
