import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { FILE_BUCKET, validFileId } from "@/lib/files/types";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const headers = { "Cache-Control": "private, no-store", Vary: "Cookie", "X-Content-Type-Options": "nosniff" };
  const fail = (status: number) => Response.json({ error: "Archivo no disponible." }, { status, headers });
  try {
    const { id } = await context.params; if (!validFileId(id)) return fail(400);
    const { data, error: authError } = await (await createClient()).auth.getUser();
    if (authError || !data.user || data.user.is_anonymous) return fail(401);
    const admin = createAdminClient();
    const { data: file, error } = await admin.from("jarvis_files").select("*").eq("id", id).eq("user_id", data.user.id).maybeSingle();
    if (error) return fail(503); if (!file) return fail(404);
    const { data: content, error: storageError } = await admin.storage.from(FILE_BUCKET).download(file.object_path);
    if (storageError || !content) return fail(404);
    return new Response(content, { headers: { ...headers, "Content-Type": file.mime_type, "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}` } });
  } catch { return fail(503); }
}
