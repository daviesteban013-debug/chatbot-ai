import { z } from "zod";
import { commandPanels } from "@/lib/jarvis-commands";
import type { LLMTool } from "@/lib/llm/types";
import type { WebToolContext } from "./web-tools";

const panels = Object.keys(commandPanels) as [keyof typeof commandPanels, ...Array<keyof typeof commandPanels>];
const input = z.object({ panel: z.enum(panels), record_id: z.string().uuid().optional() }).strict();
const detailTables = { orders: "orders", conversations: "conversations", handoffs: "handoffs" } as const;

export function crmNavigationTools(tenantId?: string | null, role?: string | null): LLMTool[] {
  return tenantId && role && ["owner", "agent", "viewer"].includes(role) ? [{
    type: "function", function: {
      name: "open_crm_panel",
      description: "Prepara la apertura de un panel del CRM solicitado por el usuario. La interfaz lo abre al terminar este turno, conservando a NEXO. Usa solo paneles disponibles; record_id permite abrir un pedido, conversación o handoff real previamente identificado por herramientas. No abre sitios externos ni ejecuta botones, pagos o confirmaciones. No afirmes que la pantalla ya se abrió: la herramienta valida el destino y el navegador lo abre después.",
      parameters: { type: "object", properties: {
        panel: { type: "string", enum: panels },
        record_id: { type: "string", description: "UUID verificado; solo para orders, conversations o handoffs." },
      }, required: ["panel"], additionalProperties: false },
    },
  }] : [];
}

export async function executeCrmNavigation(args: Record<string, unknown>, ctx: WebToolContext) {
  const parsed = input.safeParse(args);
  if (!crmNavigationTools(ctx.tenantId, ctx.role).length || !parsed.success) return { ok: false, error: "Ese panel no está disponible en esta sesión." };
  ctx.signal?.throwIfAborted();
  const { panel, record_id: recordId } = parsed.data;
  const target = commandPanels[panel];
  let href: string = target.path;
  if (recordId) {
    if (!(panel in detailTables)) return { ok: false, error: "Este panel no admite un registro individual." };
    try {
      const { data, error } = await ctx.supabase.from(detailTables[panel as keyof typeof detailTables])
        .select("id").eq("tenant_id", ctx.tenantId).eq("id", recordId)
        .abortSignal(ctx.signal ?? AbortSignal.timeout(10000)).maybeSingle();
      if (error || !data) return { ok: false, error: "No pude verificar ese registro en tu negocio. No se abrió ningún panel." };
      href += `/${recordId.toLowerCase()}`;
    } catch {
      ctx.signal?.throwIfAborted();
      return { ok: false, error: "No pude comprobar el destino. Inténtalo de nuevo." };
    }
  }
  return { ok: true, data: { navigation: { href, label: target.label }, interface_action: "open_panel", destination_verified: true, opened: false } };
}
