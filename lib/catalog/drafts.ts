import { z } from "zod";
import type { FileSection } from "@/lib/files/types";

/** Product proposals shown for review before anything is written to the catalog. */
export const MAX_IMPORT_PRODUCTS = 500;
export type DraftVariant = { color: string | null; size: string | null; sku: string | null; stock_qty: number | null; price_override: number | null };
export type DraftProduct = {
  name: string; sku: string | null; description: string | null; category: string | null;
  price_retail: number | null; price_wholesale: number | null; wholesale_min_qty: number | null;
  image_url: string | null; variants: DraftVariant[]; warnings: string[];
  /** Index of the uploaded photo this product came from (photo imports). */
  photo?: number;
};

const text = (value: unknown, max: number): string | null => {
  if (value === null || value === undefined) return null;
  const result = String(value).replace(/\s+/g, " ").trim().slice(0, max);
  return result || null;
};

/**
 * Colombian prices as people write them: 120000, "$120.000", "120,000", "COP 89.900",
 * "120k", "120 mil", "1.250.000,50". Returns whole pesos, or null when unreadable.
 */
export function parsePrice(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 && value <= 1e9 ? Math.round(value) : null;
  if (typeof value !== "string") return null;
  let raw = value.toLowerCase().replace(/cop|col\$|pesos?|\$|\s/g, "");
  let multiplier = 1;
  if (/(k|mil)$/.test(raw)) { multiplier = 1000; raw = raw.replace(/(k|mil)$/, ""); }
  if (!/^\d[\d.,]*$/.test(raw)) return null;
  const lastDot = raw.lastIndexOf("."), lastComma = raw.lastIndexOf(",");
  let normalized: string;
  if (lastDot >= 0 && lastComma >= 0) {
    const decimal = lastDot > lastComma ? "." : ",";
    normalized = raw.replace(decimal === "." ? /,/g : /\./g, "").replace(decimal, ".");
  } else if (lastDot >= 0 || lastComma >= 0) {
    const separator = lastDot >= 0 ? "." : ",";
    const parts = raw.split(separator);
    // 120.000 / 1.250.000 are thousands; 89.9 or 12,5 are decimals.
    normalized = parts.length > 2 || parts[parts.length - 1].length === 3 ? parts.join("") : parts.join(".");
  } else normalized = raw;
  const result = Number(normalized) * multiplier;
  return Number.isFinite(result) && result >= 0 && result <= 1e9 ? Math.round(result) : null;
}

export function parseQuantity(value: unknown): number | null {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value.replace(/[^\d.-]/g, "")) : NaN;
  return Number.isFinite(number) && number >= 0 && number <= 1e7 ? Math.floor(number) : null;
}

const loose = z.union([z.string(), z.number()]).nullish();
/** What the model may return. Everything is coerced and re-validated by normalizeDraft. */
export const proposedProduct = z.object({
  name: z.string().nullish(), sku: loose, description: loose, category: loose,
  price: loose, wholesale_price: loose, wholesale_min: loose,
  variants: z.array(z.object({ color: loose, size: loose, sku: loose, stock: loose, price: loose })).max(100).nullish(),
});
export type ProposedProduct = z.infer<typeof proposedProduct>;

export function normalizeDraft(raw: ProposedProduct, photo?: number): DraftProduct | null {
  const name = text(raw.name, 160);
  if (!name) return null;
  const variants: DraftVariant[] = (raw.variants ?? []).map(v => ({
    color: text(v.color, 40), size: text(v.size, 40), sku: skuOf(v.sku),
    stock_qty: parseQuantity(v.stock), price_override: parsePrice(v.price),
  })).filter(v => v.color || v.size || v.sku || v.stock_qty !== null || v.price_override !== null);
  const draft: DraftProduct = {
    name, sku: skuOf(raw.sku), description: text(raw.description, 2000), category: text(raw.category, 60),
    price_retail: parsePrice(raw.price), price_wholesale: parsePrice(raw.wholesale_price),
    wholesale_min_qty: parseQuantity(raw.wholesale_min) || null, image_url: null, variants, warnings: [],
    ...(photo === undefined ? {} : { photo }),
  };
  return withWarnings(draft);
}

function skuOf(value: unknown): string | null {
  const sku = text(value, 60)?.toUpperCase().replace(/\s+/g, "-") ?? null;
  return sku && /^[A-Z0-9][A-Z0-9._-]*$/.test(sku) ? sku : null;
}

export function withWarnings(draft: DraftProduct): DraftProduct {
  const warnings: string[] = [];
  if (draft.price_retail === null) warnings.push("Falta el precio");
  else if (draft.price_retail > 0 && draft.price_retail < 500) warnings.push("Precio muy bajo: revisa si faltan ceros");
  if (draft.price_wholesale !== null && draft.price_retail !== null && draft.price_wholesale > draft.price_retail) warnings.push("El precio mayorista es mayor que el precio al detal");
  if (!draft.variants.length || draft.variants.every(v => !v.stock_qty)) warnings.push("Sin stock: quedará en 0");
  return { ...draft, warnings };
}

/** Joins proposals that describe the same product (same SKU, or same name). */
export function mergeDrafts(drafts: DraftProduct[]): DraftProduct[] {
  const byKey = new Map<string, DraftProduct>();
  for (const draft of drafts) {
    const key = draft.sku ? `sku:${draft.sku}` : `name:${draft.name.toLowerCase()}`;
    const current = byKey.get(key);
    if (!current) { byKey.set(key, draft); continue; }
    const variants = [...current.variants];
    for (const variant of draft.variants) {
      const same = variants.find(v => (v.color ?? "").toLowerCase() === (variant.color ?? "").toLowerCase() && (v.size ?? "").toLowerCase() === (variant.size ?? "").toLowerCase());
      if (same) Object.assign(same, { stock_qty: variant.stock_qty ?? same.stock_qty, price_override: variant.price_override ?? same.price_override, sku: variant.sku ?? same.sku });
      else variants.push(variant);
    }
    byKey.set(key, withWarnings({
      ...current, variants,
      description: current.description ?? draft.description, category: current.category ?? draft.category,
      price_retail: current.price_retail ?? draft.price_retail, price_wholesale: current.price_wholesale ?? draft.price_wholesale,
      wholesale_min_qty: current.wholesale_min_qty ?? draft.wholesale_min_qty, photo: current.photo ?? draft.photo,
    }));
  }
  return [...byKey.values()].slice(0, MAX_IMPORT_PRODUCTS);
}

// ---------- Spreadsheets: the model maps columns once; code reads every row ----------

export const COLUMN_FIELDS = ["name", "sku", "description", "category", "price", "wholesale_price", "wholesale_min", "color", "size", "stock", "group"] as const;
export type ColumnField = typeof COLUMN_FIELDS[number];
export const columnMapping = z.object({
  sheet: z.string().max(200),
  header_row: z.number().int().min(0).max(5000),
  columns: z.object(Object.fromEntries(COLUMN_FIELDS.map(field => [field, z.string().regex(/^[A-Z]{1,3}$/).nullish()])) as Record<ColumnField, z.ZodOptional<z.ZodNullable<z.ZodString>>>),
});
export type ColumnMapping = z.infer<typeof columnMapping>;
export type SheetRow = { row: number; cells: Record<string, string> };

/** Spreadsheet sections ("A1: valor | B1: valor") grouped by sheet. */
export function sheetRows(sections: FileSection[]): Map<string, SheetRow[]> {
  const sheets = new Map<string, SheetRow[]>();
  for (const section of sections) {
    if (!section.sheet || !section.row) continue;
    const cells: Record<string, string> = {};
    for (const part of section.text.split(" | ")) {
      const match = /^([A-Z]{1,3})\d+: ([\s\S]*)$/.exec(part);
      if (match) cells[match[1]] = match[2].replace(/ \[fórmula: [^\]]*\]$/, "").trim();
    }
    const rows = sheets.get(section.sheet) ?? [];
    rows.push({ row: section.row, cells });
    sheets.set(section.sheet, rows);
  }
  return sheets;
}

export function applyMapping(rows: SheetRow[], mapping: ColumnMapping): DraftProduct[] {
  const column = (row: SheetRow, field: ColumnField) => {
    const letter = mapping.columns[field];
    return letter ? row.cells[letter] ?? null : null;
  };
  const drafts: DraftProduct[] = [];
  for (const row of rows) {
    if (row.row <= mapping.header_row) continue;
    const name = column(row, "name");
    if (!name?.trim()) continue;
    const color = column(row, "color"), size = column(row, "size");
    const hasVariant = Boolean(color || size);
    const draft = normalizeDraft({
      name,
      sku: hasVariant ? null : column(row, "sku"),
      description: column(row, "description"), category: column(row, "category"),
      price: column(row, "price"), wholesale_price: column(row, "wholesale_price"), wholesale_min: column(row, "wholesale_min"),
      variants: [{ color, size, sku: hasVariant ? column(row, "sku") : null, stock: column(row, "stock"), price: null }],
    });
    if (!draft) continue;
    // Rows sharing a group value (e.g. a parent reference) are variants of one product.
    const group = column(row, "group");
    drafts.push(group ? { ...draft, sku: draft.sku ?? skuOf(group) } : draft);
    if (drafts.length >= MAX_IMPORT_PRODUCTS * 10) break;
  }
  return mergeDrafts(drafts);
}
