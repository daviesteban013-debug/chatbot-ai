import sharp from "sharp";
import { createAdminClient } from "@/lib/supabase/admin";
import { PRODUCT_IMAGE_BUCKET, catalogEditor, readLimited, sameSite } from "@/lib/catalog/access";

export const runtime = "nodejs";
const MAX_BYTES = 8 * 1024 * 1024;
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

/**
 * Uploads a product photo. The image is re-encoded on the server (real format check,
 * EXIF/location removed, max 1600 px) as JPEG, which WhatsApp accepts by link.
 */
export async function POST(request: Request) {
  if (!sameSite(request)) return json({ error: "Sube la foto desde NEXO." }, 403);
  const editor = await catalogEditor();
  if (!editor.ok) return json({ error: editor.error }, editor.status);
  const data = await readLimited(request, MAX_BYTES);
  if (!data) return json({ error: "La foto debe pesar hasta 8 MB." }, 413);
  let jpeg: Buffer;
  try {
    const image = sharp(data, { limitInputPixels: 40_000_000, animated: false });
    const { format } = await image.metadata();
    if (!format || !["jpeg", "png", "webp", "heif", "avif"].includes(format)) return json({ error: "Sube una foto JPG, PNG, WebP o HEIC." }, 415);
    jpeg = await image.rotate().resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" }).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
  } catch { return json({ error: "No pude leer esa imagen. Prueba con otra foto." }, 415); }
  const path = `${editor.tenantId}/${crypto.randomUUID()}.jpg`;
  const storage = createAdminClient().storage.from(PRODUCT_IMAGE_BUCKET);
  const { error } = await storage.upload(path, jpeg, { contentType: "image/jpeg", cacheControl: "31536000", upsert: false });
  if (error) return json({ error: "No se pudo guardar la foto. Inténtalo de nuevo." }, 503);
  return json({ url: storage.getPublicUrl(path).data.publicUrl }, 201);
}
