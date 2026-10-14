"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { catalogEditor } from "@/lib/catalog/access";
import { MAX_IMPORT_PRODUCTS } from "@/lib/catalog/drafts";

type Result<T = unknown> = { ok: true; data: T } | { ok: false; error: string };

const money = z.number().int().min(0).max(1_000_000_000);
const optionalText = (max: number) => z.string().trim().max(max).nullish().transform(value => value || null);
const sku = z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9._-]{0,59}$/, "El SKU solo admite letras, números, punto, guion y guion bajo.").nullish().or(z.literal("").transform(() => null));
const imageUrl = z.string().url().startsWith("https://").max(1000).nullish().or(z.literal("").transform(() => null));
const variant = z.object({
  id: z.string().uuid().optional(), sku, color: optionalText(40), size: optionalText(40),
  stock_qty: z.number().int().min(0).max(10_000_000), price_override: money.nullish(), image_url: imageUrl, active: z.boolean().optional(),
}).strict();
const product = z.object({
  id: z.string().uuid().optional(), sku, name: z.string().trim().min(1, "Escribe el nombre del producto.").max(160),
  description: optionalText(2000), category: optionalText(60), price_retail: money,
  price_wholesale: money.nullish(), wholesale_min_qty: z.number().int().min(1).max(1_000_000).nullish(),
  image_url: imageUrl, active: z.boolean(), variants: z.array(variant).max(100),
}).strict();
export type ProductInput = z.input<typeof product>;
const importItem = product.omit({ id: true, active: true }).extend({
  variants: z.array(variant.omit({ id: true, active: true }).extend({ stock_qty: z.number().int().min(0).max(10_000_000).nullish() })).max(100),
});
/** In an import, an empty field means "not in the file": it must not erase stored data. */
const present = <T extends object>(value: T) => Object.fromEntries(Object.entries(value).filter(([, v]) => v !== null && v !== undefined));

const MESSAGES: Record<string, string> = {
  catalog_forbidden: "Tu rol no permite editar el catálogo.",
  catalog_not_found: "El producto ya no existe. Recarga la página.",
  catalog_sku_taken: "Ese SKU ya lo usa otro producto o variante.",
  catalog_stock_below_reserved: "No puedes dejar menos stock que las unidades reservadas en pedidos.",
  catalog_invalid_price: "Revisa los precios: deben ser números enteros en pesos.",
  catalog_invalid_image: "La foto no es válida. Súbela de nuevo.",
};
const failure = (message?: string) => {
  const code = Object.keys(MESSAGES).find(key => message?.includes(key));
  return { ok: false as const, error: code ? MESSAGES[code] : "No se pudo guardar. Revisa los datos e inténtalo de nuevo." };
};

export async function saveProduct(input: unknown): Promise<Result<{ id: string; sku: string }>> {
  const editor = await catalogEditor();
  if (!editor.ok) return { ok: false, error: editor.error };
  const parsed = product.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Revisa los datos del producto." };
  const { data, error } = await createAdminClient().rpc("nexo_save_product", { p_tenant: editor.tenantId, p_user: editor.userId, p_product: parsed.data });
  if (error) return failure(error.message);
  revalidatePath("/dashboard/catalog");
  return { ok: true, data: data as { id: string; sku: string } };
}

export async function archiveProduct(id: unknown): Promise<Result<{ status: "deleted" | "archived" }>> {
  const editor = await catalogEditor();
  if (!editor.ok) return { ok: false, error: editor.error };
  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return { ok: false, error: "Producto no válido." };
  const { data, error } = await createAdminClient().rpc("nexo_archive_product", { p_tenant: editor.tenantId, p_user: editor.userId, p_product: parsed.data });
  if (error) return failure(error.message);
  revalidatePath("/dashboard/catalog");
  return { ok: true, data: data as { status: "deleted" | "archived" } };
}

export type ImportSummary = { created: number; updated: number; skipped: number; results: { index: number; status: string; reason?: string }[] };
export async function importProducts(items: unknown, mode: unknown): Promise<Result<ImportSummary>> {
  const editor = await catalogEditor();
  if (!editor.ok) return { ok: false, error: editor.error };
  const parsedMode = z.enum(["merge", "only_new"]).safeParse(mode);
  const parsed = z.array(importItem).min(1).max(MAX_IMPORT_PRODUCTS).safeParse(items);
  if (!parsedMode.success || !parsed.success) {
    const issue = parsed.success ? null : parsed.error.issues[0];
    return { ok: false, error: issue ? `Producto ${Number(issue.path[0]) + 1}: ${issue.message}` : "Modo de importación no válido." };
  }
  const { data, error } = await createAdminClient().rpc("nexo_import_products", {
    p_tenant: editor.tenantId, p_user: editor.userId, p_mode: parsedMode.data,
    p_products: parsed.data.map(item => ({ ...present(item), variants: item.variants.map(present) })),
  });
  if (error) return failure(error.message);
  revalidatePath("/dashboard/catalog");
  return { ok: true, data: data as ImportSummary };
}
