import { redirect } from "next/navigation";
import { Bot } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { Panel, PanelHeader } from "@/components/dashboard/panel";
import { agentModeLabel } from "@/lib/labels";
import { formatCOP } from "@/lib/utils";
import { salesPayments } from "@/lib/sales-payments";
import { SalesPaymentsForm } from "./sales-payments-form";
import { SalesFollowupsForm } from "./sales-followups-form";
import { SalesActivity } from "./sales-activity";
import { AutonomyForm } from "./autonomy-form";

export default async function AgentPage() {
  const tenantContext = await getCurrentTenant();
  if (!tenantContext) redirect("/login");

  const supabase = await createClient();
  const tenantId = tenantContext.tenantId;
  const isOwner = tenantContext.role === "owner";

  const [{ data: agent }, { data: followupSettings, error: followupSettingsError }, { data: autonomy }] = await Promise.all([supabase
    .from("agents")
    .select(
      "id, name, tone, mode, model, system_prompt, business_rules, auto_confirm_max_total, max_discount_pct, active, updated_at"
    )
    .eq("tenant_id", tenantId)
    .eq("active", true).order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle(), supabase.from("nexo_sales_followup_settings")
      .select("enabled, delay_minutes, max_reminders")
      .eq("tenant_id", tenantId)
      .maybeSingle(), supabase.from("nexo_autonomy_settings")
      .select("catalog_stock, catalog_availability, work_items")
      .eq("tenant_id", tenantId)
      .maybeSingle()]);

  const settings = [
    { label: "Tono", value: <span className="capitalize">{agent?.tone}</span> },
    { label: "Modo", value: agent ? agentModeLabel[agent.mode] ?? agent.mode : "" },
    { label: agent?.mode === "autonomous" ? "Cierre de pedidos" : "Auto-confirmar hasta", value: agent?.mode === "autonomous" ? "Sin aprobación de asesor" : formatCOP(agent?.auto_confirm_max_total ?? 0) },
    { label: "Descuento máximo", value: `${agent?.max_discount_pct ?? 0}%` },
    { label: "Modelo", value: <span className="font-mono text-xs">{agent?.model}</span> },
  ];

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <PageHeader
        title="Agente y autonomía"
        description="Cómo vende NEXO por WhatsApp, cómo cobra y qué puede hacer por su cuenta."
        actions={<Badge variant="neutral">{isOwner ? "Dueño: puedes editar" : "Solo lectura"}</Badge>}
      />

      <div className="grid gap-5 lg:grid-cols-[1.1fr_.9fr] lg:items-start">
        <div className="space-y-5">
          <AutonomyForm canEdit={isOwner} remindersEnabled={followupSettings?.enabled === true}
            initial={{ catalog_stock: autonomy?.catalog_stock === true, catalog_availability: autonomy?.catalog_availability === true, work_items: autonomy?.work_items === true }} />
          {agent ? <SalesFollowupsForm canEdit={isOwner} initial={followupSettings} loadFailed={Boolean(followupSettingsError)} /> : null}
          {agent ? <SalesPaymentsForm canEdit={isOwner} initial={salesPayments(agent.business_rules && typeof agent.business_rules === "object" && !Array.isArray(agent.business_rules) ? agent.business_rules.sales_payments : null)} /> : null}
        </div>

        <div className="space-y-5">
          {!agent ? (
            <EmptyState
              icon={Bot}
              title="Aún no hay agente de WhatsApp"
              description="Cuando se aprovisione el agente de ventas para este negocio, aquí verás cómo atiende y cierra pedidos."
            />
          ) : (
            <>
              <Panel>
                <PanelHeader title={agent.name} description="Agente de ventas por WhatsApp"
                  actions={<Badge variant={agent.active ? "success" : "neutral"}>{agent.active ? "Activo" : "Inactivo"}</Badge>} />
                <dl className="divide-y divide-line text-[13px]">
                  {settings.map(row => (
                    <div key={row.label} className="flex justify-between gap-4 px-4 py-2.5 sm:px-5">
                      <dt className="text-muted">{row.label}</dt>
                      <dd className="text-right font-medium text-ink">{row.value}</dd>
                    </div>
                  ))}
                </dl>
                {agent.mode === "autonomous" && <p className="border-t border-line px-4 py-3 text-xs leading-5 text-muted sm:px-5">NEXO presenta el resumen completo y espera que el cliente acepte. El pedido se confirma automáticamente; el pago y el despacho conservan su estado real. Una duda o un importe alto no transfiere la venta.</p>}
              </Panel>

              <Panel>
                <PanelHeader title="Instrucciones del agente" />
                <p className="whitespace-pre-wrap px-4 py-3 text-[13px] leading-6 text-ink-soft sm:px-5">
                  {agent.system_prompt?.trim() || "Sin instrucciones definidas."}
                </p>
              </Panel>

              <Panel>
                <details>
                  <summary className="cursor-pointer select-none px-4 py-3 text-[13px] font-semibold text-ink sm:px-5">Reglas de negocio <span className="font-normal text-muted">· formato técnico</span></summary>
                  <pre className="mx-4 mb-4 overflow-x-auto whitespace-pre-wrap rounded-md border border-line bg-subtle p-3 text-xs leading-5 text-ink-soft sm:mx-5">
                    {JSON.stringify(agent.business_rules ?? {}, null, 2)}
                  </pre>
                </details>
              </Panel>
            </>
          )}
        </div>
      </div>
      <div className="mt-5">
        <SalesActivity tenantId={tenantId} role={tenantContext.role} />
      </div>
    </div>
  );
}
