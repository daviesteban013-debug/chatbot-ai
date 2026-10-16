import { FILE_BUCKET } from "@/lib/files/types";
import { importFromFile, importFromPhotos } from "@/lib/catalog/import";
import { mergeDrafts, type DraftProduct } from "@/lib/catalog/drafts";
import { storeProductPhoto, toProductJpeg } from "@/lib/catalog/photos";
import { jobOptions, type JobProgress } from "../types";
import type { AdminClient, Checkpoint, Recipe } from "../worker";

type State = { file: number; chunk: number; drafts: DraftProduct[]; warnings: string[] };
export type ImportDraft = DraftProduct & { existingId: string | null };
const PHOTO = /\.(png|jpe?g|webp)$/i;
/** One model call on a long document takes about this long; below it the job hands back. */
const MIN_STEP_MS = 20_000;

function state(checkpoint: Checkpoint): State {
  return {
    file: typeof checkpoint.file === "number" && checkpoint.file >= 0 ? Math.floor(checkpoint.file) : 0,
    chunk: typeof checkpoint.chunk === "number" && checkpoint.chunk >= 0 ? Math.floor(checkpoint.chunk) : 0,
    drafts: Array.isArray(checkpoint.drafts) ? checkpoint.drafts as DraftProduct[] : [],
    warnings: Array.isArray(checkpoint.warnings) ? checkpoint.warnings.filter((w): w is string => typeof w === "string") : [],
  };
}

async function download(admin: AdminClient, path: string): Promise<Uint8Array> {
  const { data, error } = await admin.storage.from(FILE_BUCKET).download(path);
  if (error || !data) throw new Error("No encontré el archivo adjunto. Vuelve a adjuntarlo e inténtalo de nuevo.");
  return new Uint8Array(await data.arrayBuffer());
}

/**
 * Reads the attached files (documents, spreadsheets or product photos) and leaves product
 * drafts for the owner to review. Nothing is written to the catalog: "apply" is a click.
 */
export const catalogImport: Recipe = async ctx => {
  const options = jobOptions.catalog_import.safeParse(ctx.options);
  const cp = state(ctx.checkpoint);
  const { data: rows, error } = await ctx.admin.from("jarvis_files").select("id,filename,object_path").eq("user_id", ctx.job.user_id).in("id", ctx.fileIds);
  const files = ctx.fileIds.map(id => rows?.find(file => file.id === id));
  if (error || !files.length || files.some(file => !file)) throw new Error("No encontré los archivos adjuntos. Vuelve a adjuntarlos e inténtalo de nuevo.");
  const progress = (step?: string): JobProgress => ({ done: cp.file, total: files.length, ...(step ? { step } : {}) });
  const snapshot = (): Checkpoint => ({ file: cp.file, chunk: cp.chunk, drafts: cp.drafts, warnings: cp.warnings });

  for (; cp.file < files.length;) {
    const file = files[cp.file]!;
    if (ctx.remaining() < MIN_STEP_MS) return { kind: "release", checkpoint: snapshot(), progress: progress() };
    await ctx.heartbeat(progress(`Leyendo ${file.filename}`), snapshot());
    const bytes = await download(ctx.admin, file.object_path);
    if (PHOTO.test(file.filename)) {
      const result = await importFromPhotos([{ data: bytes, name: file.filename }], ctx.account, ctx.signal);
      let imageUrl: string | null = null;
      if (result.products.some(product => product.photo === 0)) {
        try { imageUrl = await storeProductPhoto(ctx.job.tenant_id, await toProductJpeg(bytes)); }
        catch { result.warnings.push("No pude guardar la foto como imagen del producto."); }
      }
      cp.drafts.push(...result.products.map(({ photo, ...product }) => ({ ...product, image_url: photo === 0 && imageUrl ? imageUrl : product.image_url })));
      cp.warnings.push(...result.warnings.map(warning => `${file.filename}: ${warning}`));
      cp.file++; cp.chunk = 0;
      continue;
    }
    const result = await importFromFile(bytes, file.filename, ctx.account, ctx.signal, { startChunk: cp.chunk, shouldContinue: () => ctx.remaining() > MIN_STEP_MS });
    cp.drafts.push(...result.products);
    cp.warnings.push(...result.warnings.map(warning => `${file.filename}: ${warning}`));
    if (typeof result.nextChunk === "number") {
      cp.chunk = result.nextChunk;
      return { kind: "release", checkpoint: snapshot(), progress: progress(`Leyendo ${file.filename}`) };
    }
    cp.file++; cp.chunk = 0;
  }

  const drafts = mergeDrafts(cp.drafts);
  const { data: existing } = await ctx.admin.from("products").select("id,sku,name").eq("tenant_id", ctx.job.tenant_id).limit(5000);
  const bySku = new Map((existing ?? []).map(product => [product.sku, product.id]));
  const byName = new Map((existing ?? []).map(product => [product.name.toLowerCase(), product.id]));
  const products: ImportDraft[] = drafts.map(product => ({
    ...product, existingId: (product.sku && bySku.get(product.sku)) || byName.get(product.name.toLowerCase()) || null,
  }));
  const existingCount = products.filter(product => product.existingId).length;
  const warnings = [...new Set(cp.warnings)].slice(0, 20);
  const summary = products.length
    ? `Dejé ${products.length} producto${products.length === 1 ? "" : "s"} listo${products.length === 1 ? "" : "s"} para revisar${existingCount ? ` (${existingCount} ya ${existingCount === 1 ? "existe" : "existen"})` : ""}`
    : "No encontré productos en los archivos";
  return { kind: "done", result: {
    summary, drafts: products, warnings, mode: options.success ? options.data.mode : "merge",
    counts: { products: products.length, existing: existingCount, files: files.length, warnings: warnings.length },
  } };
};
