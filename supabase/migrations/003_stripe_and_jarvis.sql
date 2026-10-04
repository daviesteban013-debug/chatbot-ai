-- =====================================================================
-- Migración 003: pagos con Stripe + configuración del agente Jarvis.
--  * tenants: guarda el plan pagado y el PaymentIntent que lo activó.
--  * jarvis_configs: personalización del agente por tenant (jsonb).
-- =====================================================================

alter table tenants
  add column if not exists plan_period text check (plan_period in ('monthly', 'annual')),
  add column if not exists plan_paid_at timestamptz,
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text;

-- Asegurar que los IDs de suscripción sean únicos por tenant
create unique index if not exists tenants_stripe_subscription_uidx
  on tenants (stripe_subscription_id)
  where stripe_subscription_id is not null;

create unique index if not exists tenants_stripe_customer_uidx
  on tenants (stripe_customer_id)
  where stripe_customer_id is not null;

create table if not exists jarvis_configs (
  tenant_id   uuid primary key references tenants(id) on delete cascade,
  config      jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

alter table jarvis_configs enable row level security;
create policy jarvis_configs_tenant_all on jarvis_configs
  for all using (is_tenant_member(tenant_id)) with check (is_tenant_member(tenant_id));
