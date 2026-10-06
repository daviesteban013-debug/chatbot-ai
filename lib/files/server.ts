import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { MAX_ATTACHMENTS, validFileId, type AttachedFile, type FileSection, type FileSummary } from "./types";
import type { Database } from "@/lib/database.types";
type FileRow = Database["public"]["Tables"]["jarvis_files"]["Row"];
export const FILE_SUMMARY_COLUMNS = "id,filename,byte_size,status,warnings,section_count,created_at";
export function fileSummary(row: Pick<FileRow, "id" | "filename" | "byte_size" | "status" | "warnings" | "section_count" | "created_at">): FileSummary {
  return { id: row.id, name: row.filename, size: row.byte_size, status: row.status as FileSummary["status"], warnings: row.warnings as string[], references: row.section_count, createdAt: row.created_at };
}
export class FileAccessError extends Error {
  constructor(message: string, public status = 503) { super(message); }
}
export async function loadChatFiles(userId: string, sessionId: string, ids: unknown): Promise<AttachedFile[]> {
  if (ids !== undefined && (!Array.isArray(ids) || ids.length > MAX_ATTACHMENTS || ids.some(id => !validFileId(id)) || new Set(ids).size !== ids.length)) {
    throw new FileAccessError("Selecciona hasta tres archivos válidos.", 400);
  }
  const admin = createAdminClient();
  if (Array.isArray(ids) && ids.length) {
    const { data: selected, error } = await admin.from("jarvis_files").select("*").eq("user_id", userId).in("id", ids);
    if (error) throw new FileAccessError("No se pudieron comprobar los adjuntos.");
    if (selected?.length !== ids.length || selected.some(file => file.session_id && file.session_id !== sessionId)) {
      throw new FileAccessError("Un archivo no pertenece a esta cuenta o conversación.", 403);
    }
    const unbound = selected.filter(file => !file.session_id).map(file => file.id);
    if (unbound.length) {
      const { data: bound, error: bindError } = await admin.from("jarvis_files").update({ session_id: sessionId })
        .eq("user_id", userId).is("session_id", null).in("id", unbound).select("id");
      if (bindError || bound?.length !== unbound.length) throw new FileAccessError("No se pudieron vincular los archivos. Inténtalo de nuevo.");
    }
  }
  const { data, error } = await admin.from("jarvis_files").select("*").eq("user_id", userId).eq("session_id", sessionId)
    .order("created_at", { ascending: false }).limit(40);
  // Existing chats remain usable while the attachment migration is being installed.
  if (error?.code === "PGRST205" || error?.code === "PGRST204" || error?.code === "42P01") {
    if (!Array.isArray(ids) || !ids.length) return [];
  }
  if (error) throw new FileAccessError("No se pudieron leer los archivos de esta conversación.");
  return (data ?? []).map(row => ({ ...fileSummary(row), sections: row.sections as unknown as FileSection[], truncated: row.truncated }));
}
