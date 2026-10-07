import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseFile } from "@/lib/files/parser";
import { fileSummary, FILE_SUMMARY_COLUMNS } from "@/lib/files/server";
import { MAX_FILE_BYTES, FILE_BUCKET, fileExtension, cleanFileName, validFileId } from "@/lib/files/types";
import type { Json } from "@/lib/database.types";

export const runtime = "nodejs";
export const maxDuration = 60;
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie", "X-Content-Type-Options": "nosniff" };
const fail = (status: number, error: string) => Response.json({ error }, { status, headers });
async function account() {
  const client = await createClient();
  const { data, error } = await client.auth.getUser();
  return error || data.user?.is_anonymous ? null : data.user;
}
const sameOrigin = (request: Request) => !request.headers.get("origin") || request.headers.get("origin") === new URL(request.url).origin;
async function bytes(request: Request) {
  if (Number(request.headers.get("content-length")) > MAX_FILE_BYTES) throw new Error("El archivo supera los 3 MB.");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Selecciona un archivo con contenido.");
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > MAX_FILE_BYTES) throw new Error("El archivo supera los 3 MB."); chunks.push(value); }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  if (!size) throw new Error("El archivo está vacío.");
  const content = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { content.set(chunk, offset); offset += chunk.length; }
  return content;
}
export async function POST(request: Request) {
  if (!sameOrigin(request)) return fail(403, "Carga el archivo desde NEXO.");
  try {
    const user = await account(); if (!user) return fail(401, "Inicia sesión para adjuntar archivos.");
    let name: string;
    try { name = cleanFileName(decodeURIComponent(request.headers.get("x-file-name") ?? "")); } catch { return fail(400, "El nombre del archivo no es válido."); }
    const ext = fileExtension(name);
    const mime: Record<string, string> = { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", csv: "text/csv", txt: "text/plain", md: "text/markdown" };
    if (!mime[ext]) return fail(415, "Puedes adjuntar PDF, PNG, JPG, WebP, XLSX, CSV, DOCX, TXT o MD.");
    let content: Uint8Array;
    try { content = await bytes(request); } catch (error) { return fail(413, (error as Error).message); }
    let parsed;
    try { parsed = await parseFile(content, name, request.signal); } catch (error) { return fail(422, (error as Error).message); }
    if (request.signal.aborted) return fail(400, "La carga fue cancelada.");
    const admin = createAdminClient(), id = crypto.randomUUID(), objectPath = `${user.id}/${id}`;
    const { error: uploadError } = await admin.storage.from(FILE_BUCKET).upload(objectPath, content, { contentType: mime[ext], upsert: false });
    if (uploadError) return fail(503, "No se pudo guardar el archivo. Comprueba que el almacenamiento de adjuntos esté habilitado.");
    const { data: saved, error } = await admin.from("jarvis_files").insert({ id, user_id: user.id, filename: name, object_path: objectPath, mime_type: mime[ext], byte_size: content.length, status: parsed.status, sections: parsed.sections as unknown as Json, warnings: parsed.warnings, truncated: parsed.truncated }).select("*").single();
    if (error || !saved) {
      await admin.storage.from(FILE_BUCKET).remove([objectPath]);
      return fail(error?.message.includes("file_quota_exhausted") ? 429 : 503, error?.message.includes("file_quota_exhausted") ? "Llegaste al límite de 40 archivos o 60 MB. Elimina archivos para continuar." : "No se pudo registrar el archivo. Comprueba la migración de adjuntos.");
    }
    return Response.json({ file: fileSummary(saved) }, { status: 201, headers });
  } catch { return fail(503, "No se pudo completar la carga. Inténtalo de nuevo."); }
}
export async function GET(request: Request) {
  try {
    const user = await account(); if (!user) return fail(401, "Inicia sesión para ver tus archivos.");
    const sessionId = new URL(request.url).searchParams.get("sessionId");
    if (!sessionId || sessionId.length > 160) return fail(400, "Conversación no válida.");
    if (!/^[a-zA-Z0-9_-]+$/.test(sessionId)) return fail(400, "Conversación no válida.");
    const { data, error } = await createAdminClient().from("jarvis_files").select(`${FILE_SUMMARY_COLUMNS},session_id`).eq("user_id", user.id).order("created_at", { ascending: false }).limit(40);
    if (error) { if (["PGRST205", "42P01"].includes(error.code)) return Response.json({ files: [], library: [] }, { headers }); return fail(503, "No se pudieron cargar los adjuntos."); }
    return Response.json({ files: (data ?? []).filter(file => file.session_id === sessionId).map(fileSummary), library: (data ?? []).map(file => ({ ...fileSummary(file), sessionId: file.session_id })) }, { headers });
  } catch { return fail(503, "No se pudieron cargar los adjuntos."); }
}
export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return fail(403, "Elimina el archivo desde NEXO.");
  try {
    const user = await account(); if (!user) return fail(401, "Inicia sesión para eliminar archivos.");
    const id = new URL(request.url).searchParams.get("id"); if (!validFileId(id)) return fail(400, "Archivo no válido.");
    const admin = createAdminClient();
    const { data: file, error } = await admin.from("jarvis_files").select("*").eq("id", id).eq("user_id", user.id).maybeSingle();
    if (error) return fail(503, "No se pudo comprobar el archivo.");
    if (!file) return fail(404, "Archivo no encontrado.");
    const { error: storageError } = await admin.storage.from(FILE_BUCKET).remove([file.object_path]);
    if (storageError) return fail(503, "No se pudo eliminar el archivo.");
    const { error: deleteError } = await admin.from("jarvis_files").delete().eq("id", id).eq("user_id", user.id);
    if (deleteError) return fail(503, "No se pudo eliminar el registro. Inténtalo de nuevo.");
    return Response.json({ ok: true }, { headers });
  } catch { return fail(503, "No se pudo eliminar el archivo."); }
}
