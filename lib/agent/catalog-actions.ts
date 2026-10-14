import type { LLMTool } from "@/lib/llm/types";
import type { AttachedFile } from "@/lib/files/types";
import { fileExtension } from "@/lib/files/types";
import { catalogChangeInput, catalogProposalSchema, type CatalogProposal } from "@/lib/catalog-proposals";
import type { WebToolContext } from "./web-tools";
import type { ToolResult } from "./tools";

const ERRORS: Record<string, string> = {
  CATALOG_SKU: "No encontré ese SKU en tu catálogo. Búscalo primero con search_catalog y usa el SKU exacto.",
  CATALOG_RESERVED: "Ese stock quedaría por debajo de las unidades reservadas en pedidos. No preparé el cambio.",
  CATALOG_PHOTO: "La foto debe ser una imagen adjunta en esta conversación (JPG, PNG o WebP).",
  CATALOG_LIMIT: "Hay demasiadas propuestas pendientes en esta conversación. Confirma o cancela algunas primero.",
};

/** Low-risk catalog changes the owner allowed NEXO to apply on its own. */
export type CatalogAutonomy = { catalog_stock: boolean; catalog_availability: boolean };

const CONFIRM_ONLY = "NO aplica nada: exige pulsar Confirmar en la tarjeta. Nunca digas que el cambio ya está hecho.";
function applyRule(autonomy?: CatalogAutonomy) {
  const auto = [autonomy?.catalog_stock && "stock", autonomy?.catalog_availability && "disponibilidad"].filter(Boolean);
  if (!auto.length) return CONFIRM_ONLY;
  return `El dueño autorizó a NEXO a aplicar solo los cambios de ${auto.join(" y ")}: si el resultado trae applied_automatically=true ya quedó aplicado y se puede deshacer. Precios, productos nuevos y lo demás exigen pulsar Confirmar en la tarjeta; sin applied_automatically=true nunca digas que el cambio ya está hecho.`;
}

/**
 * NEXO prepares catalog changes (stock, prices, availability, new products) as proposals.
 * Nothing changes until the user presses Confirm on the card, except low-risk changes the
 * owner allowed NEXO to apply alone (decided in the database, logged and undoable).
 */
export function createCatalogPreparation(ctx: WebToolContext & { userId?: string | null; sessionId: string; files: AttachedFile[]; autonomy?: CatalogAutonomy }) {
  const proposals: CatalogProposal[] = [];
  const enabled = Boolean(ctx.tenantId && ctx.userId && (ctx.role === "owner" || ctx.role === "agent"));
  const tools: LLMTool[] = enabled ? [{ type: "function", function: {
    name: "propose_catalog_change",
    description: "Prepara un cambio del catálogo para que el usuario lo confirme en una tarjeta: stock (mode add suma o resta unidades que llegaron o salieron; set fija el total), precios (price exacto en COP o percent para todos los SKUs indicados, redondeado a $100), disponibilidad (active true/false) o crear un producto nuevo (opcionalmente con attachment_id de una foto adjunta en esta conversación). Usa SKUs exactos obtenidos con search_catalog. " + applyRule(ctx.autonomy),
    parameters: { type: "object", additionalProperties: false, required: ["action"], properties: {
      action: { type: "string", enum: ["stock", "price", "availability", "create"] },
      percent: { type: "number", description: "Solo para price: porcentaje a aplicar, por ejemplo 10 o -15." },
      items: { type: "array", maxItems: 20, items: { type: "object", additionalProperties: false, required: ["sku"], properties: {
        sku: { type: "string", description: "SKU de la variante (stock) o del producto (price, availability)." },
        mode: { type: "string", enum: ["add", "set"] }, qty: { type: "integer" },
        price: { type: "integer", description: "Precio nuevo en COP." }, active: { type: "boolean" },
      } } },
      attachment_id: { type: "string", description: "Solo para create: ID de una imagen adjunta en esta conversación." },
      product: { type: "object", additionalProperties: false, required: ["name", "price_retail"], properties: {
        name: { type: "string" }, price_retail: { type: "integer" }, category: { type: "string" }, description: { type: "string" },
        stock_qty: { type: "integer", description: "Stock si no tiene tallas ni colores." },
        variants: { type: "array", maxItems: 50, items: { type: "object", additionalProperties: false, properties: { color: { type: "string" }, size: { type: "string" }, stock_qty: { type: "integer" } } } },
      } },
    } },
  } }] : [];

  async function execute(args: Record<string, unknown>): Promise<ToolResult> {
    const parsed = catalogChangeInput.safeParse(args);
    if (!enabled) return { ok: false, error: "Tu rol no permite cambiar el catálogo." };
    if (!parsed.success) return { ok: false, error: "El cambio no es válido. Indica la acción, los SKUs exactos y valores enteros." };
    const change = parsed.data;
    if (change.action === "create" && change.attachment_id) {
      const file = ctx.files.find(item => item.id === change.attachment_id);
      if (!file || !["png", "jpg", "jpeg", "webp"].includes(fileExtension(file.name))) return { ok: false, error: ERRORS.CATALOG_PHOTO };
    }
    ctx.signal?.throwIfAborted();
    try {
      const { data, error } = await ctx.supabase.rpc("nexo_catalog_change_by_nexo", {
        p_tenant: ctx.tenantId, p_user: ctx.userId!, p_session: ctx.sessionId, p_change: parsed.data,
      }).abortSignal(ctx.signal ?? AbortSignal.timeout(10000));
      if (error) {
        const code = Object.keys(ERRORS).find(key => error.message.includes(key));
        return { ok: false, error: code ? ERRORS[code] : "No pude preparar el cambio. Revisa los SKUs y los valores. No se modificó el catálogo." };
      }
      const result = data as { proposal?: unknown; auto?: boolean; log_id?: unknown } | null;
      const proposal = catalogProposalSchema.safeParse(result?.proposal);
      const logId = typeof result?.log_id === "string" ? result.log_id : null;
      const auto = result?.auto === true && proposal.success && proposal.data.status === "applied" && proposal.data.applied_by_nexo && !!logId;
      if (!proposal.success || proposal.data.session_id !== ctx.sessionId || proposal.data.status !== (auto ? "applied" : "pending"))
        return { ok: false, error: "No se pudo verificar la propuesta. No confirmes ningún cambio." };
      const row: CatalogProposal = auto ? { ...proposal.data, activity: { id: logId!, status: "applied", undoable: true } } : proposal.data;
      if (!proposals.some(item => item.id === row.id)) proposals.push(row);
      if (auto) return { ok: true, data: { proposal: row, applied_automatically: true, catalog_changed: true, requires_click_confirmation: false, undo_available: true,
        note: "Aplicado por NEXO con la autonomía que activó el dueño. Se puede deshacer desde la tarjeta o en «Lo que hizo NEXO»." } };
      return { ok: true, data: { proposal: row, requires_click_confirmation: true, catalog_changed: false } };
    } catch {
      ctx.signal?.throwIfAborted();
      return { ok: false, error: "No pude preparar el cambio. No se modificó el catálogo." };
    }
  }

  return { tools, proposals, execute };
}
