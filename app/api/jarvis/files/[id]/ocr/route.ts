import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseFile } from "@/lib/files/parser";
import { fileSummary } from "@/lib/files/server";
import { FILE_BUCKET, validFileId, fileExtension } from "@/lib/files/types";
import type { Json } from "@/lib/database.types";

export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const headers = { "Cache-Control": "private, no-store", Vary: "Cookie", "X-Content-Type-Options": "nosniff" };
  const fail = (status: number, error: string) => Response.json({ error }, { status, headers });
  if (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin) return fail(403, "Lee el archivo desde NEXO.");
  try {
    const { id } = await context.params; if (!validFileId(id)) return fail(400, "Archivo no válido.");
    const { data, error: authError } = await (await createClient()).auth.getUser();
    if (authError || !data.user || data.user.is_anonymous) return fail(401, "Inicia sesión para leer tus archivos.");
    const admin = createAdminClient();
    const { data: file, error } = await admin.from("jarvis_files").select("*").eq("id", id).eq("user_id", data.user.id).maybeSingle();
    if (error) return fail(503, "No se pudo comprobar el archivo.");
    if (!file) return fail(404, "Archivo no encontrado.");
    if (!["pdf", "png", "jpg", "jpeg", "webp"].includes(fileExtension(file.filename))) return fail(415, "OCR está disponible para PDF e imágenes.");
    const { data: content, error: storageError } = await admin.storage.from(FILE_BUCKET).download(file.object_path);
    if (storageError || !content) return fail(404, "No se encontró el original.");
    let parsed;
    try { parsed = await parseFile(new Uint8Array(await content.arrayBuffer()), file.filename, request.signal); }
    catch (error) { return fail(422, (error as Error).message); }
    if (request.signal.aborted) return fail(400, "La lectura fue cancelada.");
    const { data: saved, error: saveError } = await admin.from("jarvis_files").update({ status: parsed.status, sections: parsed.sections as unknown as Json, warnings: parsed.warnings, truncated: parsed.truncated }).eq("id", id).eq("user_id", data.user.id).select("*").maybeSingle();
    if (saveError || !saved) return fail(503, "No se pudo guardar la lectura.");
    return Response.json({ file: fileSummary(saved) }, { headers });
  } catch { return fail(503, "No se pudo completar el OCR. Inténtalo de nuevo."); }
}
