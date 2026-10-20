import { catalogEditor, readLimited, sameSite } from "@/lib/catalog/access";
import { PhotoError, storeProductPhoto, toProductJpeg } from "@/lib/catalog/photos";

export const runtime = "nodejs";
const MAX_BYTES = 8 * 1024 * 1024;
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

/**
 * Uploads a product photo. The image is re-encoded on the server (real format check,
 * EXIF/location removed, max 1600 px) as JPEG, which WhatsApp accepts by link.
 */
export async function POST(request: Request) {
  if (!sameSite(request)) return json({ error: "Sube la foto desde Zorax." }, 403);
  const editor = await catalogEditor();
  if (!editor.ok) return json({ error: editor.error }, editor.status);
  const data = await readLimited(request, MAX_BYTES);
  if (!data) return json({ error: "La foto debe pesar hasta 8 MB." }, 413);
  let jpeg: Buffer;
  try { jpeg = await toProductJpeg(data); }
  catch (error) { return json({ error: error instanceof PhotoError ? error.message : "No pude leer esa imagen. Prueba con otra foto." }, 415); }
  try { return json({ url: await storeProductPhoto(editor.tenantId, jpeg) }, 201); }
  catch { return json({ error: "No se pudo guardar la foto. Inténtalo de nuevo." }, 503); }
}
