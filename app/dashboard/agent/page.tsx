import { redirect } from "next/navigation";
import { Bot, Cpu, Gauge, Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { agentModeLabel } from "@/lib/labels";
import { formatCOP } from "@/lib/utils";
import { salesPayments } from "@/lib/sales-payments";
import { SalesPaymentsForm } from "./sales-payments-form";

export default async function AgentPage() {
  const tenantContext = await getCurrentTenant();
  if (!tenantContext) redirect("/login");

  const supabase = await createClient();
  const tenantId = tenantContext.tenantId;

  const { data: agent } = await supabase
    .from("agents")
    .select(
      "id, name, tone, mode, model, system_prompt, business_rules, auto_confirm_max_total, max_discount_pct, active, updated_at"
    )
    .eq("tenant_id", tenantId)
    .eq("active", true).order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <PageHeader
        title="Configuración del Agente"
        description="Tu agente consulta productos, cotiza y cierra pedidos con la aceptación del cliente."
        actions={
          <Badge variant="neutral">
            <Lock className="size-3" /> {tenantContext.role === "owner" ? "Cobros configurables" : "Solo lectura"}
          </Badge>
        }
      />

      {!agent ? (
        <EmptyState
          icon={Bot}
          title="Aún no hay agente configurado"
          description="Cuando se aprovisione el asistente para este negocio, aquí verás su configuración."
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[.8fr_1.2fr]">
          {/* Left: key params */}
          <div className="space-y-4">
            <SalesPaymentsForm canEdit={tenantContext.role === "owner"} initial={salesPayments(agent.business_rules && typeof agent.business_rules === "object" && !Array.isArray(agent.business_rules) ? agent.business_rules.sales_payments : null)} />
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/40">
              <div className="flex items-center gap-3">
                <span className="flex size-11 items-center justify-center rounded-xl bg-slate-950 text-white">
                  <Bot className="size-5" />
                </span>
                <div className="min-w-0">
                  <h2 className="truncate text-base font-semibold text-slate-950">
                    {agent.name}
                  </h2>
                  <p className="flex items-center gap-1.5 text-xs text-slate-500">
                    <Cpu className="size-3" /> {agent.model}
                  </p>
                </div>
                <span className="ml-auto">
                  <Badge variant={agent.active ? "success" : "neutral"}>
                    {agent.active ? "Activo" : "Inactivo"}
                  </Badge>
                </span>
              </div>

              <dl className="mt-5 space-y-3 border-t border-slate-100 pt-4 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Tono</dt>
                  <dd className="text-right font-medium capitalize text-slate-800">
                    {agent.tone}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Modo</dt>
                  <dd className="text-right font-medium text-slate-800">
                    {agentModeLabel[agent.mode] ?? agent.mode}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="flex items-center gap-1.5 text-slate-500">
                    <Gauge className="size-3.5" /> {agent.mode === "autonomous" ? "Cierre de pedidos" : "Auto-confirmar hasta"}
                  </dt>
                  <dd className="text-right font-medium text-slate-800">
                    {agent.mode === "autonomous" ? "Sin aprobación de asesor" : formatCOP(agent.auto_confirm_max_total)}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Descuento máximo</dt>
                  <dd className="text-right font-medium text-slate-800">
                    {agent.max_discount_pct}%
                  </dd>
                </div>
              </dl>
              {agent.mode === "autonomous" && <p className="mt-4 text-xs leading-6 text-slate-500">NEXO presenta el resumen completo y espera que el cliente acepte. El pedido se confirma automáticamente; el pago y el despacho conservan su estado real. Una duda o un importe alto no transfiere la venta.</p>}
            </div>
          </div>

          {/* Right: prompt + rules */}
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/40">
              <h2 className="mb-3 text-sm font-semibold text-slate-900">
                System prompt
              </h2>
              <p className="whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-700">
                {agent.system_prompt?.trim() || "Sin system prompt definido."}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/40">
              <h2 className="mb-3 text-sm font-semibold text-slate-900">
                Reglas de negocio
              </h2>
              <pre className="overflow-x-auto whitespace-pre-wrap rounded-xl bg-slate-950 p-4 text-xs leading-6 text-slate-200">
                {JSON.stringify(agent.business_rules ?? {}, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
