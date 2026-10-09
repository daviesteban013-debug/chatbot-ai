import { z } from "zod";
import type { LLMTool } from "@/lib/llm/types";
import type { WebToolContext } from "./web-tools";
import type { ToolResult } from "./tools";
import { proposalInput, proposalSchema, type OrderProposal } from "@/lib/order-proposals";

const repeatInput = z.object({ customer_id: z.string().uuid(), order_id: z.string().uuid().optional() }).strict();

export function createOrderPreparation(ctx: WebToolContext & { userId?: string | null; sessionId: string }) {
  const proposals: OrderProposal[] = [];
  const enabled = Boolean(ctx.tenantId && ctx.userId && (ctx.role === "owner" || ctx.role === "agent"));
  const tools: LLMTool[] = enabled ? [
    { type: "function", function: { name: "prepare_order_proposal",
      description: "Prepara una propuesta de pedido minorista con precios y stock consultados en la base de datos. Usa customer_id confirmado y SKUs exactos del catálogo. NO registra el pedido ni reserva stock: requiere que el usuario pulse Confirmar pedido en la tarjeta. No acepta precios, permisos, envío ni descuentos. Sin envío ni cobro asignados; el registro confirmado queda como borrador para completar estos datos.",
      parameters: { type: "object", properties: { customer_id: { type: "string" }, items: { type: "array", minItems: 1, maxItems: 10, items: { type: "object", properties: { variant_sku: { type: "string" }, qty: { type: "integer", minimum: 1, maximum: 1000 } }, required: ["variant_sku", "qty"], additionalProperties: false } } }, required: ["customer_id", "items"], additionalProperties: false },
    } },
    { type: "function", function: { name: "prepare_repeat_order_proposal",
      description: "Prepara otra propuesta con los mismos productos y cantidades de un pedido minorista del cliente confirmado. order_id es opcional: omítelo solo cuando el usuario pida repetir su último pedido. Valida que pedido y cliente pertenezcan al negocio, obtiene SKUs actuales por variante y vuelve a comprobar precios y stock. No copia precios, descuentos, dirección, envío ni pagos históricos. Rechaza pedidos mayoristas y pedidos de más de 10 líneas. Exige pulsar Confirmar pedido; no registra pedido ni reserva inventario.",
      parameters: { type: "object", properties: { customer_id: { type: "string", format: "uuid" }, order_id: { type: "string", format: "uuid" } }, required: ["customer_id"], additionalProperties: false },
    } },
  ] : [];

  async function prepare(args: Record<string, unknown>, verify?: (proposal: OrderProposal) => boolean): Promise<ToolResult> {
    const parsed = proposalInput.safeParse(args);
    if (!enabled || !parsed.success) return { ok: false, error: "No puedes preparar este pedido o faltan un cliente y productos válidos." };
    ctx.signal?.throwIfAborted();
    try {
      const { data, error } = await ctx.supabase.rpc("nexo_prepare_order", { p_tenant: ctx.tenantId, p_user: ctx.userId!, p_session: ctx.sessionId, p_customer: parsed.data.customer_id, p_items: parsed.data.items }).abortSignal(ctx.signal ?? AbortSignal.timeout(10000));
      if (error) return { ok: false, error: "No pude preparar el pedido. Comprueba el cliente, los SKUs, las cantidades y el stock. No se creó pedido ni se reservó inventario." };
      const result = data as { ok?: boolean; proposal?: unknown } | null;
      const proposal = proposalSchema.safeParse(result?.proposal);
      if (!result?.ok || !proposal.success || proposal.data.session_id !== ctx.sessionId || proposal.data.snapshot.customer_id !== parsed.data.customer_id || proposal.data.status !== "pending") return { ok: false, error: "No se pudo verificar la propuesta. No confirmes ningún pedido." };
      const requested = new Map(parsed.data.items.map(item => [item.variant_sku, item.qty]));
      const returned = proposal.data.snapshot.items;
      if (returned.length !== requested.size || new Set(returned.map(item => item.sku)).size !== requested.size || returned.some(item => requested.get(item.sku) !== item.qty)) return { ok: false, error: "La propuesta no coincide con los productos y cantidades solicitados. No confirmes ningún pedido." };
      if (verify && !verify(proposal.data)) return { ok: false, error: "Hay una propuesta pendiente con condiciones anteriores o el catálogo cambió durante la consulta. Revisa y cancela esa propuesta antes de pedir otra. No se registró pedido ni se reservó stock." };
      if (!proposals.some(value => value.id === proposal.data.id)) proposals.push(proposal.data);
      return { ok: true, data: { proposal: proposal.data, requires_click_confirmation: true, order_created: false, stock_reserved: false } };
    } catch {
      ctx.signal?.throwIfAborted();
      return { ok: false, error: "No pude preparar el pedido. No se creó pedido ni se reservó inventario." };
    }
  }

  const execute = (args: Record<string, unknown>) => prepare(args);

  async function executeRepeat(args: Record<string, unknown>): Promise<ToolResult> {
    const parsed = repeatInput.safeParse(args);
    if (!enabled || !parsed.success) return { ok: false, error: "No puedes repetir este pedido o falta un cliente confirmado." };
    const signal = ctx.signal ?? AbortSignal.timeout(10000);
    signal.throwIfAborted();
    try {
      let orderQuery = ctx.supabase.from("orders").select("id, customer_id, order_type, status, created_at")
        .eq("tenant_id", ctx.tenantId).eq("customer_id", parsed.data.customer_id);
      if (parsed.data.order_id) orderQuery = orderQuery.eq("id", parsed.data.order_id);
      const { data: order, error: orderError } = await orderQuery.order("created_at", { ascending: false }).order("id").limit(1).abortSignal(signal).maybeSingle();
      if (orderError || !order) return { ok: false, error: "No encontré ese pedido del cliente en tu negocio. Consulta su historial antes de repetirlo." };
      if (order.order_type !== "retail") return { ok: false, error: "Este pedido es mayorista. La repetición automática prepara pedidos minoristas; revísalo con tu equipo para conservar las condiciones comerciales correctas." };
      const { data: lines, count, error: linesError } = await ctx.supabase.from("order_items")
        .select("variant_id, qty", { count: "exact" }).eq("tenant_id", ctx.tenantId).eq("order_id", order.id)
        .order("id").limit(11).abortSignal(signal);
      if (linesError || count === null || !lines?.length || count !== lines.length || count > 10) return { ok: false, error: "No puedo repetir un pedido vacío, incompleto o de más de 10 líneas. No se creó ninguna propuesta." };
      const quantities = new Map<string, number>();
      for (const line of lines) {
        if (!line.variant_id || !Number.isSafeInteger(line.qty) || line.qty < 1 || line.qty > 1000) return { ok: false, error: "El pedido contiene variantes o cantidades que no puedo repetir. Revisa el pedido original." };
        const quantity = (quantities.get(line.variant_id) ?? 0) + line.qty;
        if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1000) return { ok: false, error: "Las cantidades del pedido no se pueden repetir automáticamente. Revisa el pedido original." };
        quantities.set(line.variant_id, quantity);
      }
      const { data: variants, error: variantsError } = await ctx.supabase.from("product_variants")
        .select("id, sku, stock_qty, reserved_qty, price_override, products!inner(tenant_id, active, price_retail)")
        .eq("tenant_id", ctx.tenantId).in("id", [...quantities.keys()]).eq("active", true)
        .eq("products.tenant_id", ctx.tenantId).eq("products.active", true).abortSignal(signal);
      if (variantsError || !variants || variants.length !== quantities.size) return { ok: false, error: "Un producto del pedido ya no está disponible en el catálogo. No reemplacé variantes ni preparé un pedido parcial." };
      const current = new Map<string, { sku: string; qty: number; unitPrice: number }>();
      for (const variant of variants) {
        const product = Array.isArray(variant.products) ? variant.products[0] : variant.products;
        const unitPrice = variant.price_override ?? product?.price_retail;
        const qty = quantities.get(variant.id)!;
        if (typeof unitPrice !== "number" || !Number.isSafeInteger(unitPrice) || unitPrice < 0 || variant.stock_qty - variant.reserved_qty < qty) return { ok: false, error: "No hay stock suficiente o no pude verificar el precio actual de todos los productos. No preparé un pedido parcial." };
        current.set(variant.id, { sku: variant.sku, qty, unitPrice });
      }
      const items = variants.map(variant => ({ variant_sku: variant.sku, qty: quantities.get(variant.id)! }));
      // The RPC may deduplicate an existing pending proposal. Never describe an old
      // snapshot as current: compare its exact variants, quantities and prices.
      const prepared = await prepare({ customer_id: order.customer_id, items }, proposal => {
        const seen = new Set<string>();
        const subtotal = [...current.values()].reduce((sum, item) => sum + item.qty * item.unitPrice, 0);
        if (proposal.snapshot.subtotal !== subtotal || proposal.snapshot.total !== subtotal) return false;
        if (proposal.snapshot.items.length !== current.size) return false;
        for (const item of proposal.snapshot.items) {
          const expected = current.get(item.variant_id);
          if (!expected || seen.has(item.variant_id) || item.sku !== expected.sku || item.qty !== expected.qty || item.unit_price !== expected.unitPrice) return false;
          seen.add(item.variant_id);
        }
        return true;
      });
      if (!prepared.ok) return prepared;
      return { ok: true, data: { ...(prepared.data as Record<string, unknown>), source_order: order,
        historical_terms_copied: false, current_prices_and_stock_verified: true } };
    } catch {
      ctx.signal?.throwIfAborted();
      return { ok: false, error: "No pude preparar la repetición del pedido. Comprueba su estado antes de volver a intentarlo." };
    }
  }

  return { tools, proposals, execute, executeRepeat };
}
