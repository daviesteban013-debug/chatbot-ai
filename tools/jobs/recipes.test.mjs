import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { moduleUrl } from "../lib/load-module.mjs";

const url = source => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
let state;
globalThis.__recipeState = () => state;
const tenant = "11111111-1111-4111-8111-111111111111";
const user = "22222222-2222-4222-8222-222222222222";
const base = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", tenant_id: tenant, user_id: user, session_id: "session-a", status: "running" };
const uuid = n => `${String(n).padStart(8, "0")}-0000-4000-8000-000000000000`;

// A tiny Supabase double: tables answer from state.tables[table], RPCs from state.rpc(name,args).
function query(table) {
  const filters = [];
  const q = {
    select() { return q; }, order() { return q; }, limit() { return q; }, gte() { return q; },
    eq(key, value) { filters.push(row => row[key] === value); return q; },
    in(key, values) { filters.push(row => values.includes(row[key])); return q; },
    rows() { return (state.tables[table] ?? []).filter(row => filters.every(filter => filter(row))); },
    maybeSingle: async () => ({ data: q.rows()[0] ?? null, error: null }),
    then(resolve, reject) { return Promise.resolve({ data: q.rows(), error: null }).then(resolve, reject); },
  };
  return q;
}
const admin = {
  from: table => query(table),
  rpc(name, args) { state.calls.push({ name, args }); const result = Promise.resolve(state.rpc(name, args)); return { abortSignal: () => result, then: (a, b) => result.then(a, b) }; },
  storage: { from: () => ({ download: async path => ({ data: { arrayBuffer: async () => new Uint8Array([path.length]).buffer }, error: null }) }) },
};
const context = (job, { checkpoint = {}, options = {}, fileIds = [], remaining = () => 40_000 } = {}) => {
  const ctx = { admin, job: { ...base, ...job }, account: { tenantId: tenant, userId: user, channel: "web" }, signal: new AbortController().signal,
    checkpoint, options, fileIds, note: null, remaining, beats: [],
    async heartbeat(progress, cp) { ctx.beats.push({ progress, checkpoint: cp ? structuredClone(cp) : undefined }); if (cp) ctx.checkpoint = cp; } };
  return ctx;
};
beforeEach(() => { state = { calls: [], tables: {}, rpc: () => ({ data: null, error: null }) }; });

// ---------- Collections ----------
const { collectionsReview, buildReport } = await import(await moduleUrl("lib/jobs/recipes/collections-review.ts"));
const order = (n, total, customer, ago = n) => ({ id: uuid(n), created_at: new Date(Date.UTC(2026, 9, 1) + ago * 3600_000).toISOString(), total, payment_method: "enlace", conversation_id: null,
  customer: { id: uuid(900 + customer), name: customer === 1 ? "Ana" : null, phone: `+5730000000${customer}` } });

test("the collections review pages through unpaid orders, groups them by customer and never sends anything", async () => {
  const orders = Array.from({ length: 102 }, (_, i) => order(i + 1, 1000 * (i + 1), (i % 3) + 1));
  state.rpc = (name, args) => {
    if (name === "nexo_enqueue_sales_followups") return { data: 2, error: null };
    if (name === "nexo_unpaid_orders") {
      assert.equal(args.p_tenant, tenant);
      const start = args.p_after_id ? orders.findIndex(o => o.id === args.p_after_id) + 1 : 0;
      return { data: orders.slice(start, start + 100), error: null };
    }
    if (name === "nexo_collections_status") return { data: Object.fromEntries(args.p_orders.map((id, index) => [id,
      index % 10 === 0 ? { state: "scheduled", due_at: "2026-10-16T12:00:00Z", reminders: 0 } : index % 10 === 1 ? { state: "reminded", reminders: 1, reminded_at: "2026-10-15T12:00:00Z" } : { state: "requires_call", reason: "payment_method", reminders: 0 }])), error: null };
    throw new Error("unexpected " + name);
  };
  const ctx = context({ kind: "collections_review" });
  const outcome = await collectionsReview(ctx);
  assert.equal(outcome.kind, "done");
  assert.deepEqual(state.calls.map(c => c.name), ["nexo_enqueue_sales_followups", "nexo_unpaid_orders", "nexo_collections_status", "nexo_unpaid_orders", "nexo_collections_status"]);
  assert.equal(outcome.result.counts.orders, 102); assert.equal(outcome.result.counts.customers, 3);
  assert.equal(outcome.result.counts.scheduled, 11); assert.equal(outcome.result.counts.reminded, 11); assert.equal(outcome.result.counts.requires_call, 80);
  assert.equal(outcome.result.counts.total, orders.reduce((s, o) => s + o.total, 0));
  assert.ok(outcome.result.customers[0].total >= outcome.result.customers[1].total, "biggest debtor first");
  assert.match(outcome.result.summary, /^Revisé 102 pedidos por cobrar \(\$ 5\.253\.000\): 11 con recordatorio en cola, 11 ya recordados, 80 requieren tu llamada$/);
  assert.equal(outcome.result.csv.split("\n")[0], "Cliente,Teléfono,Pedido,Fecha,Total,Estado,Motivo");
  assert.equal(outcome.result.csv.split("\n").length, 103); assert.equal(outcome.result.csv_truncated, false);
  assert.ok(ctx.beats.every(beat => beat.checkpoint.enqueued === true));
});

test("a short run hands the review back after a page and the next run continues without re-enqueuing", async () => {
  const orders = Array.from({ length: 150 }, (_, i) => order(i + 1, 500, 1));
  state.rpc = (name, args) => name === "nexo_enqueue_sales_followups" ? { data: 0, error: null }
    : name === "nexo_unpaid_orders" ? { data: orders.slice(args.p_after_id ? orders.findIndex(o => o.id === args.p_after_id) + 1 : 0).slice(0, 100), error: null }
    : { data: Object.fromEntries(args.p_orders.map(id => [id, { state: "requires_call", reason: "followups_paused", reminders: 0 }])), error: null };
  let left = 40_000;
  const first = context({ kind: "collections_review" }, { remaining: () => left });
  const after = new Promise(resolve => { const original = first.heartbeat; first.heartbeat = async (...args) => { await original(...args); if (first.checkpoint.orders?.length === 100) left = 1000; resolve(); }; });
  const outcome = await collectionsReview(first);
  await after;
  assert.equal(outcome.kind, "release"); assert.equal(outcome.checkpoint.orders.length, 100); assert.equal(outcome.progress.done, 100);
  state.calls = [];
  const second = context({ kind: "collections_review" }, { checkpoint: outcome.checkpoint });
  const done = await collectionsReview(second);
  assert.equal(done.kind, "done"); assert.equal(done.result.counts.orders, 150);
  assert.deepEqual(state.calls.map(c => c.name), ["nexo_unpaid_orders", "nexo_collections_status"], "the queue refresh ran only once");
  assert.equal(done.result.customers[0].orders.length, 150);
});

test("the report csv stays under 64 KB and failures to read are public", async () => {
  const many = Array.from({ length: 3000 }, (_, i) => ({ ...order(i + 1, 10, 1), customer: { id: uuid(1), name: "Un nombre bastante largo para la prueba", phone: "+573000000001" }, state: "requires_call", reason: "not_eligible", reminders: 0 }));
  const report = buildReport(many);
  assert.ok(Buffer.byteLength(report.csv) <= 64 * 1024); assert.equal(report.csv_truncated, true);
  assert.equal(buildReport([]).summary, "No hay pedidos por cobrar ahora mismo");
  state.rpc = name => name === "nexo_enqueue_sales_followups" ? { data: 0, error: null } : { data: null, error: { message: "boom" } };
  await assert.rejects(collectionsReview(context({ kind: "collections_review" })), /No pude leer los pedidos por cobrar/);
});

// ---------- Stock and prices from a sheet ----------
const sheet = (rows, name = "Hoja1") => rows.map((cells, index) => ({ reference: `hoja ${name}, fila ${index + 1}`, sheet: name, row: index + 1,
  text: cells.map((value, column) => `${String.fromCharCode(65 + column)}${index + 1}: ${value}`).join(" | ") }));
const update = await import(await moduleUrl("lib/jobs/recipes/catalog-update.ts", {
  "@/lib/catalog/import": url("export async function mapSheetColumns(){globalThis.__recipeState().mapped=true;return globalThis.__recipeState().mapping??null;}"),
}));
const fileId = uuid(77);
const proposal = (action, items, status = "pending") => ({ id: uuid(500 + state.calls.length), session_id: "session-a", status, expires_at: "2026-10-17T00:00:00Z", product_id: null, applied_by_nexo: status === "applied",
  snapshot: { action, title: action === "stock" ? "Actualizar stock" : "Cambiar precios", lines: items.map(item => action === "stock"
    ? { kind: "stock", variant_id: uuid(1), product_id: uuid(2), sku: item.sku, label: item.sku, before: 1, after: item.qty, reserved: 0 }
    : { kind: "price", product_id: uuid(2), sku: item.sku, label: item.sku, before: 1000, after: item.price }) } });

function stockTables(rows) {
  state.tables = {
    jarvis_files: [{ id: fileId, user_id: user, filename: "stock.xlsx", truncated: false, sections: sheet(rows) }],
    product_variants: [{ sku: "TEN-40", reserved_qty: 2, product_id: uuid(10), tenant_id: tenant }, { sku: "TEN-41", reserved_qty: 0, product_id: uuid(10), tenant_id: tenant }, { sku: "GORRA", reserved_qty: 0, product_id: uuid(11), tenant_id: tenant }],
    products: [{ id: uuid(10), sku: "TENIS", tenant_id: tenant }, { id: uuid(11), sku: "GORRA", tenant_id: tenant }],
    nexo_catalog_proposals: [], nexo_activity_log: [],
  };
}

test("columns are found by header name, unknown and reserved rows are skipped before any batch is sent", () => {
  const rows = sheet([["Referencia", "Existencias", "Precio venta"], ["ten-40", "5", "$120.000"], ["", "", ""], ["X", "y", "z"]]);
  const sheets = new Map([["Hoja1", rows.map(r => ({ row: r.row, cells: Object.fromEntries(r.text.split(" | ").map(p => [p[0], p.slice(4)])) }))]]);
  const columns = update.detectColumns(sheets.get("Hoja1"));
  assert.deepEqual(columns, { header_row: 1, sku: "A", stock: "B", price: "C" });
  assert.deepEqual(update.readRows(sheets.get("Hoja1"), columns, "auto"), [{ row: 2, sku: "TEN-40", stock: 5, price: 120000 }, { row: 4, sku: "X", stock: null, price: null }]);
  assert.deepEqual(update.readRows(sheets.get("Hoja1"), columns, "stock")[0], { row: 2, sku: "TEN-40", stock: 5, price: null });
  assert.equal(update.detectColumns([{ row: 1, cells: { A: "Nombre", B: "Precio" } }]), null, "a price column without SKUs is not enough");
});

test("stock batches apply through the autonomy RPC, prices become cards, and every row is accounted for", async () => {
  stockTables([["SKU", "Stock", "Precio"], ["TEN-40", "1", ""], ["TEN-41", "7", "130.000"], ["GORRA", "3", "35000"], ["NOPE", "2", ""], ["TENIS", "4", ""], ["", "9", ""], ["TEN-41", "", "131.000"]]);
  state.rpc = (name, args) => {
    assert.equal(name, "nexo_catalog_change_by_nexo"); assert.equal(args.p_session, "session-a"); assert.equal(args.p_user, user);
    const change = args.p_change;
    return change.action === "stock" ? { data: { proposal: proposal("stock", change.items, "applied"), auto: true, log_id: uuid(600) }, error: null }
      : { data: { proposal: proposal("price", change.items), auto: false }, error: null };
  };
  const ctx = context({ kind: "catalog_update" }, { fileIds: [fileId], options: { stock_mode: "set", fields: "auto" } });
  const outcome = await update.catalogUpdate(ctx);
  assert.equal(outcome.kind, "done");
  const changes = state.calls.map(call => call.args.p_change);
  assert.deepEqual(changes, [
    { action: "stock", items: [{ sku: "TEN-41", mode: "set", qty: 7 }, { sku: "GORRA", mode: "set", qty: 3 }] },
    { action: "price", items: [{ sku: "TEN-41", price: 131000 }, { sku: "GORRA", price: 35000 }] },
  ], "the last price row for a product wins, in first-seen order");
  const skipped = outcome.result.skipped.map(item => [item.row, item.reason.split(" (")[0]]);
  assert.deepEqual(skipped, [
    [2, "el stock quedaría por debajo de las unidades reservadas en pedidos"], [5, "SKU no encontrado en el catálogo"],
    [6, "el SKU es de un producto con varias variantes: usa el SKU de cada variante"], [7, "sin SKU legible"], [3, "precio repetido para el mismo producto: se usa la última fila"],
  ]);
  assert.equal(outcome.result.counts.applied, 2); assert.equal(outcome.result.counts.pending, 2); assert.equal(outcome.result.counts.rows, 7);
  assert.equal(outcome.result.applied[0].log_id, uuid(600)); assert.equal(outcome.result.proposal_ids.length, 1);
  assert.match(outcome.result.summary, /^Actualicé el stock de 2 productos; 2 cambios esperan tu confirmación; 5 filas omitidas$/);
  assert.equal(state.mapped, undefined, "no model call when the headers are clear");
  // Every batch was checkpointed as in-flight before it was sent, then cleared.
  const flights = ctx.beats.map(beat => beat.checkpoint.in_flight);
  assert.deepEqual(flights.map(flight => flight?.index ?? null), [null, 0, null, 1, null]);
});

test("too many pending cards stops the job gracefully; a dead run reconciles its in-flight batch", async () => {
  stockTables([["SKU", "Precio"], ...Array.from({ length: 25 }, (_, i) => [i < 2 ? ["TEN-41", "GORRA"][i] : `S${i}`, "1000"])]);
  state.tables.products.push(...Array.from({ length: 23 }, (_, i) => ({ id: uuid(100 + i), sku: `S${i + 2}`, tenant_id: tenant })));
  let calls = 0;
  state.rpc = (name, args) => ++calls === 1 ? { data: { proposal: proposal("price", args.p_change.items), auto: false }, error: null } : { data: null, error: { message: "CATALOG_LIMIT" } };
  const ctx = context({ kind: "catalog_update" }, { fileIds: [fileId], options: { fields: "price" } });
  const outcome = await update.catalogUpdate(ctx);
  assert.equal(outcome.kind, "done"); assert.equal(outcome.result.counts.pending, 20); assert.equal(outcome.result.counts.pending_later, 5);
  assert.match(outcome.result.summary, /quedaron para después/);

  // The previous run died after sending batch 0 (add mode): the database kept the applied proposal.
  stockTables([["SKU", "Stock"], ["TEN-41", "2"], ["GORRA", "1"]]);
  state.calls = [];
  const applied = { ...proposal("stock", [{ sku: "TEN-41", qty: 3 }, { sku: "GORRA", qty: 2 }], "applied"), user_id: user, created_at: "2026-10-16T10:00:30Z" };
  state.tables.nexo_catalog_proposals = [applied]; state.tables.nexo_activity_log = [{ id: uuid(700), kind: "catalog", ref_id: applied.id }];
  const checkpoint = { batches: [{ action: "stock", items: [{ sku: "TEN-41", mode: "add", qty: 2 }, { sku: "GORRA", mode: "add", qty: 1 }], rows: [2, 3] }], next: 0,
    in_flight: { index: 0, at: "2026-10-16T10:00:00Z" }, applied: [], pending: [], skipped: [], proposal_ids: [], pending_later: 0, warnings: [], rows: 2, stock_mode: "add", file: "stock.xlsx" };
  const resumed = await update.catalogUpdate(context({ kind: "catalog_update" }, { fileIds: [fileId], checkpoint: structuredClone(checkpoint) }));
  assert.equal(resumed.kind, "done"); assert.equal(state.calls.length, 0, "the batch is not sent twice");
  assert.deepEqual(resumed.result.applied.map(line => [line.sku, line.after, line.log_id]), [["TEN-41", 3, uuid(700)], ["GORRA", 2, uuid(700)]]);
  // Without a trace in the database, adding again could double-count: the rows go to a human.
  state.tables.nexo_catalog_proposals = [];
  const unknown = await update.catalogUpdate(context({ kind: "catalog_update" }, { fileIds: [fileId], checkpoint: structuredClone(checkpoint) }));
  assert.equal(state.calls.length, 0);
  assert.deepEqual(unknown.result.skipped.map(item => item.reason), Array(2).fill("no pude confirmar si este lote se aplicó; revisa el stock a mano"));
});

test("unclear headers ask the model once; a sheet without SKUs fails with a readable message", async () => {
  stockTables([["Columna A", "Columna B"], ["TEN-41", "4"]]);
  state.mapping = { sheet: "Hoja1", header_row: 1, columns: { sku: "A", stock: "B" } };
  state.rpc = (name, args) => ({ data: { proposal: proposal("stock", args.p_change.items), auto: false }, error: null });
  const outcome = await update.catalogUpdate(context({ kind: "catalog_update" }, { fileIds: [fileId] }));
  assert.equal(state.mapped, true); assert.equal(outcome.result.counts.pending, 1);
  state.mapped = undefined; state.mapping = { sheet: "Hoja1", header_row: 1, columns: { name: "A" } };
  await assert.rejects(update.catalogUpdate(context({ kind: "catalog_update" }, { fileIds: [fileId] })), /No reconocí las columnas de SKU/);
  state.tables.jarvis_files[0].sections = [];
  await assert.rejects(update.catalogUpdate(context({ kind: "catalog_update" }, { fileIds: [fileId] })), /La hoja no tiene filas/);
});

// ---------- Import ----------
const importer = await import(await moduleUrl("lib/jobs/recipes/catalog-import.ts", {
  "@/lib/catalog/import": url(`export async function importFromFile(data,name,account,signal,resume={}){const s=globalThis.__recipeState();s.imports.push({name,resume:{startChunk:resume.startChunk}});
      const chunks=s.chunks[name]??1;let index=resume.startChunk??0;const products=[];let nextChunk=null;
      for(;index<chunks;index++){products.push({name:name+' '+index,sku:null,description:null,category:null,price_retail:1000,price_wholesale:null,wholesale_min_qty:null,image_url:null,variants:[],warnings:[]});if(index+1<chunks&&resume.shouldContinue&&!resume.shouldContinue()){nextChunk=index+1;break;}}
      return {products,warnings:['aviso '+name],nextChunk};}
    export async function importFromPhotos(photos){globalThis.__recipeState().imports.push({name:photos[0].name,photo:true});return {products:[{name:'Gorra',sku:null,description:null,category:null,price_retail:35000,price_wholesale:null,wholesale_min_qty:null,image_url:null,variants:[],warnings:[],photo:0}],warnings:[]};}`),
  "@/lib/catalog/photos": url("export async function toProductJpeg(d){return d;} export async function storeProductPhoto(tenant){globalThis.__recipeState().stored=tenant;return 'https://x.supabase.co/storage/v1/object/public/product-images/'+tenant+'/p.jpg';}"),
}));
const pdfId = uuid(80), photoId = uuid(81);

test("imports read every file, hand back between chunks and leave drafts with their existing match", async () => {
  state.imports = []; state.chunks = { "catalogo.pdf": 3 };
  state.tables = { jarvis_files: [{ id: pdfId, user_id: user, filename: "catalogo.pdf", object_path: `${user}/${pdfId}` }, { id: photoId, user_id: user, filename: "gorra.jpg", object_path: `${user}/${photoId}` }],
    products: [{ id: uuid(5), sku: "GORRA-1", name: "Gorra", tenant_id: tenant }] };
  let left = 60_000;
  const first = context({ kind: "catalog_import" }, { fileIds: [pdfId, photoId], remaining: () => (left -= 25_000) });
  const paused = await importer.catalogImport(first);
  assert.equal(paused.kind, "release"); assert.deepEqual([paused.checkpoint.file, paused.checkpoint.chunk], [0, 1]);
  assert.equal(paused.checkpoint.drafts.length, 1); assert.equal(paused.progress.step, "Leyendo catalogo.pdf");
  const second = context({ kind: "catalog_import" }, { fileIds: [pdfId, photoId], checkpoint: paused.checkpoint, options: { mode: "only_new" } });
  const done = await importer.catalogImport(second);
  assert.equal(done.kind, "done");
  assert.deepEqual(state.imports.map(i => [i.name, i.photo ? "photo" : i.resume.startChunk]), [["catalogo.pdf", 0], ["catalogo.pdf", 1], ["gorra.jpg", "photo"]]);
  assert.deepEqual(done.result.drafts.map(d => [d.name, d.existingId, d.image_url]), [
    ["catalogo.pdf 0", null, null], ["catalogo.pdf 1", null, null], ["catalogo.pdf 2", null, null], ["Gorra", uuid(5), `https://x.supabase.co/storage/v1/object/public/product-images/${tenant}/p.jpg`],
  ]);
  assert.equal(done.result.drafts[3].photo, undefined); assert.equal(state.stored, tenant);
  assert.deepEqual(done.result.counts, { products: 4, existing: 1, files: 2, warnings: 1 }); assert.equal(done.result.mode, "only_new");
  assert.equal(done.result.summary, "Dejé 4 productos listos para revisar (1 ya existe)");
  assert.deepEqual(done.result.warnings, ["catalogo.pdf: aviso catalogo.pdf"]);
  const before = second.beats[0];
  assert.equal(before.progress.step, "Leyendo catalogo.pdf"); assert.equal(before.checkpoint.file, 0, "the checkpoint is saved before each file is read");
});

test("missing files fail with a public message", async () => {
  state.imports = []; state.tables = { jarvis_files: [], products: [] };
  await assert.rejects(importer.catalogImport(context({ kind: "catalog_import" }, { fileIds: [pdfId] })), /No encontré los archivos adjuntos/);
});
