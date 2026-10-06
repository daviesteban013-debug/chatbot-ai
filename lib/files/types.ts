export const MAX_FILE_BYTES = 3 * 1024 * 1024;
export const MAX_ATTACHMENTS = 3;
export const FILE_ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.xlsx,.csv,.docx,.txt,.md";
export const FILE_BUCKET = "jarvis-files";
export type FileSection = { reference: string; text: string; extraction?: "ocr"; ocrConfidence?: number; sheet?: string; row?: number; numbers?: Record<string, number> };
export type ParsedFile = { sections: FileSection[]; warnings: string[]; status: "ready" | "needs_ocr"; truncated: boolean };
export type FileSummary = { id: string; name: string; size: number; status: "ready" | "needs_ocr"; warnings: string[]; references: number; createdAt: string };
export type AttachedFile = FileSummary & { sections: FileSection[]; truncated: boolean };
export type LibraryFile = FileSummary & { sessionId: string | null };
export const validFileId = (id: unknown): id is string => typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
export function fileExtension(name: string) { return name.toLowerCase().split(".").pop() ?? ""; }
export function cleanFileName(name: string) { return name.replace(/[\u0000-\u001f\u007f/\\]/g, "_").trim().slice(0, 160) || "archivo"; }
