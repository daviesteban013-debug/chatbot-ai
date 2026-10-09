import { z } from "zod";
export const proposalSchema = z.object({
  id:z.string().uuid(), session_id:z.string(), status:z.enum(["pending","confirmed","canceled","expired","handed_off"]),
  expires_at:z.string(), order_id:z.string().uuid().nullable(), handoff_id:z.string().uuid().nullable(),
  snapshot:z.object({customer_id:z.string().uuid(),customer_name:z.string(),currency:z.literal("COP"),fulfillment:z.literal("unassigned"),subtotal:z.number().int().nonnegative(),total:z.number().int().nonnegative(),
    items:z.array(z.object({variant_id:z.string().uuid(),sku:z.string(),name:z.string(),qty:z.number().int().positive(),unit_price:z.number().int().nonnegative()})).min(1).max(10)})
});
export type OrderProposal = z.infer<typeof proposalSchema>;
export const proposalInput = z.object({customer_id:z.string().uuid(),items:z.array(z.object({variant_sku:z.string().trim().min(1).max(100),qty:z.number().int().min(1).max(1000)}).strict()).min(1).max(10)}).strict().refine(value=>new Set(value.items.map(item=>item.variant_sku)).size===value.items.length);
export const decisionInput = z.object({id:z.string().uuid(),decision:z.enum(["confirm","cancel","handoff"])}).strict();
export const proposalErrors:Record<string,string> = {
  price_changed:"El precio cambió. Cancela esta propuesta y pide a NEXO una nueva antes de confirmar.",
  stock_changed:"El stock cambió. No se registró ningún pedido. Puedes cancelar o pasar la propuesta a atención humana.",
  product_changed:"Un producto ya no está disponible. Prepara otra propuesta o pásala a atención humana.",
  customer_changed:"El cliente cambió. Busca de nuevo al cliente antes de preparar el pedido.",
};
