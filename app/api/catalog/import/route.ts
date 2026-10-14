import { createAdminClient } from "@/lib/supabase/admin";
import { catalogEditor, sameSite } from "@/lib/catalog/access";
import { CATALOG_FILE_BYTES, CATALOG_PHOTO_BYTES, MAX_CATALOG_PHOTOS, importFromFile, importFromPhotos, importFromText } from "@/lib/catalog/import";
import { CreditError } from "@/lib/credits/server";

export const runtime = "nodejs";
export const maxDuration = 300;
const MAX_BODY = CATALOG_PHOTO_BYTES * MAX_CATALOG_PHOTOS + 1024 * 1024;
const FILE_TYPES = ["pdf", "xlsx", "csv", "docx", "txt", "md", "png", "jpg", "jpeg", "webp"];
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

/**
 * Reads a catalog (file, photos or pasted text) and returns product proposals for review.
 * Nothing is written to the catalog here; the owner confirms afterwards.
 */
export async function POST(request: Request) {
  if (!sameSite(request)) return json({ error: "Importa el catálogo desde NEXO." }, 403);
  const editor = await catalogEditor();
  if (!editor.ok) return json({ error: editor.error }, editor.status);
  const declared = Number(request.headers.get("content-length"));
  if (!declared || declared > MAX_BODY) return json({ error: "Los archivos son demasiado grandes." }, 413);
  let form: FormData;
  try { form = await request.formData(); } catch { return json({ error: "Solicitud no válida." }, 400); }

  const account = { tenantId: editor.tenantId, userId: editor.userId, channel: "web" as const };
  try {
    let result;
    const text = form.get("text"), file = form.get("file"), photos = form.getAll("photos");
    if (typeof text === "string" && text.trim()) {
      if (text.length > 50_000) return json({ error: "Pega hasta 50.000 caracteres por vez." }, 413);
      result = await importFromText(text, account);
    } else if (file instanceof File) {
      const extension = file.name.toLowerCase().split(".").pop() ?? "";
      if (!FILE_TYPES.includes(extension)) return json({ error: "Sube PDF, Excel (XLSX), CSV, Word (DOCX), TXT o fotos JPG, PNG y WebP." }, 415);
      if (file.size > CATALOG_FILE_BYTES) return json({ error: "El archivo debe pesar hasta 10 MB." }, 413);
      result = await importFromFile(new Uint8Array(await file.arrayBuffer()), file.name, account, request.signal);
    } else if (photos.length && photos.every(photo => photo instanceof File)) {
      const files = photos as File[];
      if (files.length > MAX_CATALOG_PHOTOS) return json({ error: `Sube hasta ${MAX_CATALOG_PHOTOS} fotos por vez.` }, 413);
      if (files.some(photo => photo.size > CATALOG_PHOTO_BYTES)) return json({ error: "Cada foto debe pesar hasta 8 MB." }, 413);
      result = await importFromPhotos(await Promise.all(files.map(async photo => ({ data: new Uint8Array(await photo.arrayBuffer()), name: photo.name }))), account, request.signal);
    } else return json({ error: "Sube un archivo, fotos o pega el texto de tu catálogo." }, 400);

    // Mark which proposals would update an existing product (same SKU or name).
    const { data: existing } = await createAdminClient().from("products").select("id,sku,name").eq("tenant_id", editor.tenantId).limit(5000);
    const bySku = new Map((existing ?? []).map(p => [p.sku, p.id]));
    const byName = new Map((existing ?? []).map(p => [p.name.toLowerCase(), p.id]));
    const products = result.products.map(product => ({
      ...product, existingId: (product.sku && bySku.get(product.sku)) || byName.get(product.name.toLowerCase()) || null,
    }));
    return json({ products, warnings: result.warnings });
  } catch (error) {
    if (error instanceof CreditError) return json({ error: error.message }, 402);
    const message = error instanceof Error && /^(El archivo|La extensión|Usa una|Guarda el|Formatos disponibles|No encontré|El CSV|El lector|NEXO no pudo)/.test(error.message)
      ? error.message : "No pude leer el catálogo. Inténtalo de nuevo o prueba con otro formato.";
    return json({ error: message }, 422);
  }
}
