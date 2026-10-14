import type { Tenant, TenantMemberRole } from "@/lib/database.types";

export interface CurrentTenant {
  tenantId: string;
  role: TenantMemberRole;
  tenant: Tenant | null;
}

const ROLE_ORDER: Record<TenantMemberRole, number> = { owner: 0, agent: 1, viewer: 2 };

/**
 * Picks the user's business deterministically when they belong to several:
 * owned first, then agent, then viewer; ties go to the oldest business. A bare
 * `limit(1)` let the CRM, billing and WhatsApp switch businesses between requests.
 */
export function pickMembership(rows: unknown): CurrentTenant | null {
  const list = (Array.isArray(rows) ? rows : rows ? [rows] : []) as { tenant_id: string; role: TenantMemberRole; tenants?: unknown }[];
  const options = list.map(row => {
    const joined = row.tenants as Tenant | Tenant[] | null | undefined;
    const tenant = Array.isArray(joined) ? (joined[0] ?? null) : (joined ?? null);
    return { tenantId: row.tenant_id, role: row.role, tenant };
  });
  options.sort((a, b) => (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9)
    || (a.tenant?.created_at ?? "").localeCompare(b.tenant?.created_at ?? "")
    || a.tenantId.localeCompare(b.tenantId));
  return options[0] ?? null;
}
