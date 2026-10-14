import sharp from "sharp";
import { createAdminClient } from "@/lib/supabase/admin";
import { PRODUCT_IMAGE_BUCKET } from "./access";

export class PhotoError extends Error {}

/**
 * Re-encodes a product photo on the server: checks the real format, removes EXIF and
 * location, fixes rotation and caps it at 1600 px as JPEG (WhatsApp sends JPEG/PNG by link).
 */
export async function toProductJpeg(data: Uint8Array): Promise<Buffer> {
  let image;
  try {
    image = sharp(data, { limitInputPixels: 40_000_000, animated: false });
    const { format } = await image.metadata();
    if (!format || !["jpeg", "png", "webp", "heif", "avif"].includes(format)) throw new PhotoError("Sube una foto JPG, PNG, WebP o HEIC.");
  } catch (error) {
    throw error instanceof PhotoError ? error : new PhotoError("No pude leer esa imagen. Prueba con otra foto.");
  }
  try {
    return await image.rotate().resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" }).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
  } catch { throw new PhotoError("No pude leer esa imagen. Prueba con otra foto."); }
}

/** Stores the JPEG in the public product bucket under the business and returns its URL. */
export async function storeProductPhoto(tenantId: string, jpeg: Buffer): Promise<string> {
  const path = `${tenantId}/${crypto.randomUUID()}.jpg`;
  const storage = createAdminClient().storage.from(PRODUCT_IMAGE_BUCKET);
  const { error } = await storage.upload(path, jpeg, { contentType: "image/jpeg", cacheControl: "31536000", upsert: false });
  if (error) throw new Error("No se pudo guardar la foto.");
  return storage.getPublicUrl(path).data.publicUrl;
}
