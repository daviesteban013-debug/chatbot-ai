export type CatalogVariant = {
  id: string; sku: string; color: string | null; size: string | null; stock_qty: number; reserved_qty: number;
  price_override: number | null; image_url: string | null; active: boolean;
};
export type CatalogProduct = {
  id: string; sku: string; name: string; description: string | null; category: string | null;
  price_retail: number; price_wholesale: number | null; wholesale_min_qty: number | null;
  image_url: string | null; active: boolean; variants: CatalogVariant[];
};

/** Uploads one photo through the server (re-encoded to JPEG) and returns its public URL. */
export async function uploadProductPhoto(file: Blob, name = "foto.jpg"): Promise<string> {
  const response = await fetch("/api/catalog/images", { method: "POST", headers: { "x-file-name": encodeURIComponent(name) }, body: file });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || typeof data.url !== "string") throw new Error(data.error ?? "No se pudo subir la foto.");
  return data.url;
}
