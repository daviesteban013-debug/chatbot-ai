import { z } from "zod";

const variant = z.object({ color: z.string().optional(), size: z.string().optional(), stock_qty: z.number().int().nonnegative().optional() });
const line = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("stock"), variant_id: z.string().uuid(), product_id: z.string().uuid(), sku: z.string(), label: z.string(), before: z.number().int(), after: z.number().int(), reserved: z.number().int() }),
  z.object({ kind: z.literal("price"), product_id: z.string().uuid(), sku: z.string(), label: z.string(), before: z.number().int(), after: z.number().int() }),
  z.object({ kind: z.literal("active"), product_id: z.string().uuid(), sku: z.string(), label: z.string(), before: z.boolean(), after: z.boolean() }),
  z.object({ kind: z.literal("create"), label: z.string(), after: z.number().int(), category: z.string().optional(), variants: z.array(variant), photo: z.string().optional() }),
]);
export const catalogProposalSchema = z.object({
  id: z.string().uuid(), session_id: z.string(), status: z.enum(["pending", "applied", "canceled", "expired"]),
  expires_at: z.string(), product_id: z.string().uuid().nullable(),
  snapshot: z.object({ action: z.enum(["stock", "price", "availability", "create"]), title: z.string(), lines: z.array(line).min(1).max(20), attachment_id: z.string().uuid().optional() }),
});
export type CatalogProposal = z.infer<typeof catalogProposalSchema>;
export type CatalogProposalLine = CatalogProposal["snapshot"]["lines"][number];
export const catalogDecisionInput = z.object({ id: z.string().uuid(), decision: z.enum(["confirm", "cancel"]) }).strict();

const sku = z.string().trim().min(1).max(100);
/** What NEXO may request. Prices, stock and identity are re-read by the database. */
export const catalogChangeInput = z.discriminatedUnion("action", [
  z.object({ action: z.literal("stock"), items: z.array(z.object({ sku, mode: z.enum(["add", "set"]), qty: z.number().int().min(-100000).max(10000000) }).strict()).min(1).max(20) }).strict(),
  z.object({ action: z.literal("price"), percent: z.number().min(-90).max(500).optional(), items: z.array(z.object({ sku, price: z.number().int().min(0).max(1_000_000_000).optional() }).strict()).min(1).max(20) }).strict(),
  z.object({ action: z.literal("availability"), items: z.array(z.object({ sku, active: z.boolean() }).strict()).min(1).max(20) }).strict(),
  z.object({ action: z.literal("create"), attachment_id: z.string().uuid().optional(), product: z.object({
    name: z.string().trim().min(1).max(160), price_retail: z.number().int().min(0).max(1_000_000_000),
    category: z.string().trim().max(60).optional(), description: z.string().trim().max(2000).optional(),
    stock_qty: z.number().int().min(0).max(10_000_000).optional(),
    variants: z.array(z.object({ color: z.string().trim().max(40).optional(), size: z.string().trim().max(40).optional(), stock_qty: z.number().int().min(0).max(10_000_000).optional() }).strict()).max(50).optional(),
  }).strict() }).strict(),
]);

export const catalogProposalErrors: Record<string, string> = {
  changed: "El catálogo cambió desde que NEXO preparó esta propuesta. No se aplicó nada: pídele una nueva.",
  expired: "La propuesta venció. Pídele a NEXO que la prepare de nuevo.",
  decided: "Esta propuesta ya se decidió.",
};
