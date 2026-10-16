import type { FileSection } from "@/lib/files/types";
import { parsePrice, parseQuantity, sheetRows, type SheetRow } from "@/lib/catalog/drafts";
import { mapSheetColumns } from "@/lib/catalog/import";
import { catalogProposalSchema } from "@/lib/catalog-proposals";
import { jobOptions, type JobProgress } from "../types";
import type { Checkpoint, JobContext, Recipe } from "../worker";

type Action = "stock" | "price";
type Item = { sku: string; mode?: "add" | "set"; qty?: number; price?: number };
type Batch = { action: Action; items: Item[]; rows: number[] };
export type AppliedLine = { kind: string; sku: string; label: string; before: number; after: number; log_id: string | null };
export type PendingProposal = { id: string; title: string; lines: number; expires_at: string };
export type SkippedRow = { row: number; sku: string | null; reason: string };
type State = {
  batches: Batch[] | null; next: number; in_flight: { index: number; at: string } | null;
  applied: AppliedLine[]; pending: PendingProposal[]; skipped: SkippedRow[]; proposal_ids: string[]; pending_later: number; warnings: string[]; rows: number;
  stock_mode: "set" | "add"; file: string;
};

const BATCH = 20;
const MAX_ROWS = 5000;
const MIN_STEP_MS = 8000;
const SKU = /^[A-Z0-9][A-Z0-9._-]{0,59}$/;
const HEADERS: Record<"sku" | "stock" | "price", RegExp> = {
  sku: /^(sku|ref(erencia)?|c[oó]d(igo)?( ?(de )?(producto|variante|barras))?|item|art[ií]culo)$/i,
  stock: /^(stock|existencias?|cantidad(es)?|inventario|unidades|disponibles?|qty|cant\.?)$/i,
  price: /^(precio( ?(al ?)?detal| ?venta| ?p[uú]blico| ?unitario)?|price|valor|pvp|precio ?cop)$/i,
};
const RPC_ERRORS: Record<string, string> = {
  CATALOG_SKU: "SKU no encontrado en el catálogo",
  CATALOG_RESERVED: "el stock quedaría por debajo de las unidades reservadas en pedidos",
  CATALOG_INPUT: "valor no válido",
};

const stateOf = (checkpoint: Checkpoint, fallback: Pick<State, "stock_mode" | "file">): State => ({
  batches: Array.isArray(checkpoint.batches) ? checkpoint.batches as Batch[] : null,
  next: typeof checkpoint.next === "number" ? checkpoint.next : 0,
  in_flight: checkpoint.in_flight && typeof checkpoint.in_flight === "object" ? checkpoint.in_flight as State["in_flight"] : null,
  applied: Array.isArray(checkpoint.applied) ? checkpoint.applied as AppliedLine[] : [],
  pending: Array.isArray(checkpoint.pending) ? checkpoint.pending as PendingProposal[] : [],
  skipped: Array.isArray(checkpoint.skipped) ? checkpoint.skipped as SkippedRow[] : [],
  proposal_ids: Array.isArray(checkpoint.proposal_ids) ? checkpoint.proposal_ids as string[] : [],
  pending_later: typeof checkpoint.pending_later === "number" ? checkpoint.pending_later : 0,
  warnings: Array.isArray(checkpoint.warnings) ? checkpoint.warnings as string[] : [],
  rows: typeof checkpoint.rows === "number" ? checkpoint.rows : 0,
  stock_mode: checkpoint.stock_mode === "add" ? "add" : fallback.stock_mode,
  file: typeof checkpoint.file === "string" ? checkpoint.file : fallback.file,
});

/** Header row and column letters found by name, without the model. */
export function detectColumns(rows: SheetRow[]): { header_row: number; sku: string; stock: string | null; price: string | null } | null {
  for (const row of rows.slice(0, 8)) {
    const found: Partial<Record<"sku" | "stock" | "price", string>> = {};
    for (const [letter, value] of Object.entries(row.cells)) {
      const text = value.trim();
      for (const key of ["sku", "stock", "price"] as const) if (!found[key] && HEADERS[key].test(text)) { found[key] = letter; break; }
    }
    if (found.sku && (found.stock || found.price)) return { header_row: row.row, sku: found.sku, stock: found.stock ?? null, price: found.price ?? null };
  }
  return null;
}

/** Rows of a stock/price sheet, each with the SKU and whatever values it carries. */
export function readRows(rows: SheetRow[], columns: { header_row: number; sku: string; stock: string | null; price: string | null }, fields: "auto" | "stock" | "price") {
  const parsed: { row: number; sku: string | null; stock: number | null; price: number | null }[] = [];
  // An empty cell means "no value in the file", never 0.
  const cell = (row: SheetRow, letter: string | null) => { const value = letter ? row.cells[letter]?.trim() : ""; return value ? value : null; };
  for (const row of rows) {
    if (row.row <= columns.header_row) continue;
    const raw = cell(row, columns.sku)?.toUpperCase().replace(/\s+/g, "-") ?? "";
    const sku = SKU.test(raw) ? raw : null;
    const stockCell = cell(row, columns.stock);
    // Text without a single digit ("agotado", "?") is not a quantity, and never becomes 0.
    const stock = fields !== "price" && stockCell && /\d/.test(stockCell) ? parseQuantity(stockCell) : null;
    const price = fields !== "stock" ? parsePrice(cell(row, columns.price)) : null;
    if (!raw && stock === null && price === null) continue;
    parsed.push({ row: row.row, sku, stock, price });
    if (parsed.length >= MAX_ROWS) break;
  }
  return parsed;
}

async function plan(ctx: JobContext, cp: State, fields: "auto" | "stock" | "price") {
  const { data: file, error } = await ctx.admin.from("jarvis_files").select("filename,sections,truncated").eq("user_id", ctx.job.user_id).eq("id", ctx.fileIds[0] ?? "").maybeSingle();
  if (error || !file) throw new Error("No encontré el archivo adjunto. Vuelve a adjuntarlo e inténtalo de nuevo.");
  cp.file = file.filename;
  if (file.truncated) cp.warnings.push("El archivo es muy largo: NEXO leyó solo la primera parte.");
  const sheets = sheetRows(file.sections as unknown as FileSection[]);
  if (!sheets.size) throw new Error("La hoja no tiene filas con datos. Revisa que la primera fila tenga encabezados como SKU, Stock o Precio.");
  let sheet: string | null = null; let columns: ReturnType<typeof detectColumns> = null;
  for (const [name, rows] of sheets) { columns = detectColumns(rows); if (columns) { sheet = name; break; } }
  if (!columns || !sheet) {
    const mapped = await mapSheetColumns(sheets, ctx.account, "stock y precios");
    if (mapped?.columns.sku && (mapped.columns.stock || mapped.columns.price)) {
      sheet = mapped.sheet;
      columns = { header_row: mapped.header_row, sku: mapped.columns.sku, stock: mapped.columns.stock ?? null, price: mapped.columns.price ?? null };
    }
  }
  if (!columns || !sheet) throw new Error("No reconocí las columnas de SKU, stock o precio en la hoja. Usa encabezados como «SKU», «Stock» y «Precio».");
  if (fields === "stock" && !columns.stock) throw new Error("No reconocí la columna de stock en la hoja. Usa un encabezado como «Stock» o «Existencias».");
  if (fields === "price" && !columns.price) throw new Error("No reconocí la columna de precio en la hoja. Usa un encabezado como «Precio».");
  const rows = readRows(sheets.get(sheet)!, columns, fields);
  cp.rows = rows.length;
  if (rows.length >= MAX_ROWS) cp.warnings.push(`Leí las primeras ${MAX_ROWS} filas. Divide el archivo para actualizar el resto.`);

  // Known SKUs first: one unknown SKU would otherwise reject its whole batch.
  const skus = [...new Set(rows.flatMap(row => row.sku ? [row.sku] : []))];
  const variants = new Map<string, { reserved: number; product_id: string }>();
  const products = new Map<string, string>();
  for (let index = 0; index < skus.length; index += 500) {
    const slice = skus.slice(index, index + 500);
    const [{ data: variantRows, error: variantError }, { data: productRows, error: productError }] = await Promise.all([
      ctx.admin.from("product_variants").select("sku,reserved_qty,product_id").eq("tenant_id", ctx.job.tenant_id).in("sku", slice),
      ctx.admin.from("products").select("id,sku").eq("tenant_id", ctx.job.tenant_id).in("sku", slice),
    ]);
    if (variantError || productError) throw new Error("No pude leer el catálogo para comparar los SKUs. Inténtalo de nuevo.");
    for (const variant of variantRows ?? []) variants.set(variant.sku, { reserved: variant.reserved_qty, product_id: variant.product_id });
    for (const product of productRows ?? []) products.set(product.sku, product.id);
  }
  const variantCounts = new Map<string, number>();
  const productIds = [...new Set(products.values())];
  for (let index = 0; index < productIds.length; index += 500) {
    const { data } = await ctx.admin.from("product_variants").select("product_id").eq("tenant_id", ctx.job.tenant_id).in("product_id", productIds.slice(index, index + 500));
    for (const variant of data ?? []) variantCounts.set(variant.product_id, (variantCounts.get(variant.product_id) ?? 0) + 1);
  }

  const stockItems: { item: Item; row: number }[] = [];
  const priceItems = new Map<string, { item: Item; row: number }>();
  for (const row of rows) {
    if (!row.sku) { cp.skipped.push({ row: row.row, sku: null, reason: "sin SKU legible" }); continue; }
    if (row.stock === null && row.price === null) { cp.skipped.push({ row: row.row, sku: row.sku, reason: "sin stock ni precio legible" }); continue; }
    const variant = variants.get(row.sku);
    const productId = variant?.product_id ?? products.get(row.sku) ?? null;
    if (!productId) { cp.skipped.push({ row: row.row, sku: row.sku, reason: RPC_ERRORS.CATALOG_SKU }); continue; }
    if (row.stock !== null) {
      if (!variant && variantCounts.get(productId) !== 1) cp.skipped.push({ row: row.row, sku: row.sku, reason: "el SKU es de un producto con varias variantes: usa el SKU de cada variante" });
      else if (cp.stock_mode === "set" && variant && row.stock < variant.reserved) cp.skipped.push({ row: row.row, sku: row.sku, reason: `${RPC_ERRORS.CATALOG_RESERVED} (${variant.reserved})` });
      else if (cp.stock_mode === "add" && row.stock === 0) cp.skipped.push({ row: row.row, sku: row.sku, reason: "sumar 0 unidades no cambia nada" });
      else stockItems.push({ item: { sku: row.sku, mode: cp.stock_mode, qty: row.stock }, row: row.row });
    }
    if (row.price !== null) {
      const previous = priceItems.get(productId);
      if (previous) cp.skipped.push({ row: previous.row, sku: previous.item.sku, reason: "precio repetido para el mismo producto: se usa la última fila" });
      priceItems.set(productId, { item: { sku: row.sku, price: row.price }, row: row.row });
    }
  }
  const batches: Batch[] = [];
  const group = (action: Action, list: { item: Item; row: number }[]) => {
    for (let index = 0; index < list.length; index += BATCH) {
      const slice = list.slice(index, index + BATCH);
      batches.push({ action, items: slice.map(entry => entry.item), rows: slice.map(entry => entry.row) });
    }
  };
  group("stock", stockItems); group("price", [...priceItems.values()]);
  cp.batches = batches; cp.next = 0;
}

const snapshotOf = (cp: State): Checkpoint => ({ ...cp });
const progressOf = (cp: State, step?: string): JobProgress => ({ done: cp.next, total: cp.batches?.length ?? 0, ...(step ? { step } : {}) });

function recordProposal(cp: State, batch: Batch, raw: unknown, auto: boolean, logId: string | null) {
  const proposal = catalogProposalSchema.safeParse(raw);
  if (!proposal.success) { cp.skipped.push(...batch.rows.map(row => ({ row, sku: null, reason: "no pude verificar el resultado; revisa el catálogo" }))); return; }
  if (auto && proposal.data.status === "applied") {
    cp.applied.push(...proposal.data.snapshot.lines.flatMap(line => line.kind === "create" ? [] : [{ kind: line.kind, sku: line.sku, label: line.label, before: Number(line.before), after: Number(line.after), log_id: logId }]));
  } else if (proposal.data.status === "pending") {
    cp.pending.push({ id: proposal.data.id, title: proposal.data.snapshot.title, lines: proposal.data.snapshot.lines.length, expires_at: proposal.data.expires_at });
    if (!cp.proposal_ids.includes(proposal.data.id)) cp.proposal_ids.push(proposal.data.id);
  } else cp.skipped.push(...batch.rows.map(row => ({ row, sku: null, reason: "la tarjeta de este lote ya venció o se canceló" })));
}

/** A run died between sending a batch and recording it: find what the database kept. */
async function reconcile(ctx: JobContext, cp: State) {
  const flight = cp.in_flight!; const batch = cp.batches![flight.index];
  cp.in_flight = null;
  if (!batch) return;
  const since = new Date(Math.max(0, Date.parse(flight.at) - 60_000)).toISOString();
  const { data } = await ctx.admin.from("nexo_catalog_proposals").select("*").eq("session_id", ctx.job.session_id).eq("user_id", ctx.job.user_id).gte("created_at", since).limit(100);
  const wanted = batch.items.map(item => item.sku).sort().join("|");
  const match = (data ?? []).find(row => {
    const proposal = catalogProposalSchema.safeParse(row);
    return proposal.success && proposal.data.snapshot.action === batch.action
      && proposal.data.snapshot.lines.map(line => line.kind === "create" ? "" : line.sku).sort().join("|") === wanted;
  });
  if (match) {
    const { data: log } = await ctx.admin.from("nexo_activity_log").select("id").eq("kind", "catalog").eq("ref_id", match.id).maybeSingle();
    recordProposal(cp, batch, match, match.applied_by_nexo === true, log?.id ?? null);
    cp.next = flight.index + 1;
  } else if (batch.action === "stock" && cp.stock_mode === "add") {
    // Adding twice would double-count: leave these rows for a human.
    cp.skipped.push(...batch.rows.map(row => ({ row, sku: null, reason: "no pude confirmar si este lote se aplicó; revisa el stock a mano" })));
    cp.next = flight.index + 1;
  }
}

/**
 * Stock and prices from a spreadsheet. Stock applies alone when the owner enabled that
 * autonomy (decided per batch in the database, undoable); prices always become cards.
 */
export const catalogUpdate: Recipe = async ctx => {
  const options = jobOptions.catalog_update.safeParse(ctx.options);
  const fields = options.success ? options.data.fields : "auto";
  const cp = stateOf(ctx.checkpoint, { stock_mode: options.success ? options.data.stock_mode : "set", file: "" });
  if (!cp.batches) {
    await plan(ctx, cp, fields);
    await ctx.heartbeat(progressOf(cp, "Comparando con el catálogo"), snapshotOf(cp));
  }
  if (cp.in_flight) { await reconcile(ctx, cp); await ctx.heartbeat(progressOf(cp), snapshotOf(cp)); }
  const batches = cp.batches!;
  while (cp.next < batches.length) {
    if (ctx.remaining() < MIN_STEP_MS) return { kind: "release", checkpoint: snapshotOf(cp), progress: progressOf(cp) };
    const index = cp.next; const batch = batches[index];
    cp.in_flight = { index, at: new Date().toISOString() };
    await ctx.heartbeat(progressOf(cp, batch.action === "stock" ? "Actualizando stock" : "Preparando precios"), snapshotOf(cp));
    const { data, error } = await ctx.admin.rpc("nexo_catalog_change_by_nexo", {
      p_tenant: ctx.job.tenant_id, p_user: ctx.job.user_id, p_session: ctx.job.session_id, p_change: { action: batch.action, items: batch.items },
    }).abortSignal(AbortSignal.timeout(20_000));
    cp.in_flight = null;
    if (error) {
      if (error.message.includes("CATALOG_LIMIT")) {
        cp.pending_later = batches.slice(index).reduce((sum, item) => sum + item.rows.length, 0);
        cp.next = batches.length;
        break;
      }
      if (error.message.includes("CATALOG_FORBIDDEN")) throw new Error("Tu rol ya no permite cambiar el catálogo.");
      const code = Object.keys(RPC_ERRORS).find(key => error.message.includes(key));
      if (!code) throw new Error("No pude aplicar un lote de cambios. Inténtalo de nuevo.");
      cp.skipped.push(...batch.rows.map(row => ({ row, sku: null, reason: RPC_ERRORS[code] })));
    } else {
      const result = data && typeof data === "object" && !Array.isArray(data) ? data as Record<string, unknown> : {};
      recordProposal(cp, batch, result.proposal, result.auto === true, typeof result.log_id === "string" ? result.log_id : null);
    }
    cp.next = index + 1;
    await ctx.heartbeat(progressOf(cp), snapshotOf(cp));
  }

  const appliedStock = cp.applied.filter(line => line.kind === "stock").length;
  const pendingLines = cp.pending.reduce((sum, item) => sum + item.lines, 0);
  const parts = [
    appliedStock ? `Actualicé el stock de ${appliedStock} producto${appliedStock === 1 ? "" : "s"}` : "",
    pendingLines ? `${pendingLines} cambio${pendingLines === 1 ? "" : "s"} espera${pendingLines === 1 ? "" : "n"} tu confirmación` : "",
    cp.skipped.length ? `${cp.skipped.length} fila${cp.skipped.length === 1 ? "" : "s"} omitida${cp.skipped.length === 1 ? "" : "s"}` : "",
    cp.pending_later ? `${cp.pending_later} fila${cp.pending_later === 1 ? "" : "s"} quedaron para después (demasiadas tarjetas pendientes)` : "",
  ].filter(Boolean);
  const summary = parts.length ? parts.join("; ") : "La hoja no traía cambios aplicables";
  return { kind: "done", result: {
    summary, file: cp.file, warnings: cp.warnings.slice(0, 10), stock_mode: cp.stock_mode, fields,
    counts: { rows: cp.rows, applied: cp.applied.length, pending: pendingLines, skipped: cp.skipped.length, pending_later: cp.pending_later },
    applied: cp.applied.slice(0, 500), pending: cp.pending, skipped: cp.skipped.slice(0, 300), proposal_ids: cp.proposal_ids,
  } };
};
