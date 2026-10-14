import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { moduleUrl } from "../lib/load-module.mjs";

const url = source => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
let state;
globalThis.__catalogState = () => state;
beforeEach(() => { state = { calls: [], replies: [], parsed: null, vision: false, user: { id: "user-1" }, tenant: { tenantId: "tenant-1", role: "owner" }, uploads: [] }; });

const drafts = await import(await moduleUrl("lib/catalog/drafts.ts"));
const stubs = {
  "@/lib/files/parser": url("export async function parseFile(data,name,signal,options){const s=globalThis.__catalogState();s.parseOptions=options;if(!s.parsed)throw new Error('El archivo no contiene un PDF válido.');return s.parsed;}"),
  "@/lib/llm/metered": url(`export async function meteredChatCompletion(account,messages,tools,options){const s=globalThis.__catalogState();
    s.calls.push({account,messages,tool:tools[0].function.name,options});const reply=s.replies.shift();
    return {toolCalls:[{id:'c',type:'function',function:{name:tools[0].function.name,arguments:JSON.stringify(reply)}}],content:null,tokensIn:1,tokensOut:1,model:'m',latencyMs:1};}`),
  "@/lib/llm/client": url("export const supportsVision=()=>globalThis.__catalogState().vision;"),
};
const importer = await import(await moduleUrl("lib/catalog/import.ts", stubs));
const account = { tenantId: "tenant-1", userId: "user-1", channel: "web" };

test("prices are read the way Colombian stores write them", () => {
  const cases = { "$120.000": 120000, "120,000": 120000, "COP 89.900": 89900, "120k": 120000, "45 mil": 45000, "1.250.000": 1250000,
    "1.250.000,50": 1250001, "89.9": 90, "149000": 149000, "$ 35.000 ": 35000, "gratis": null, "-5": null, "": null };
  for (const [input, expected] of Object.entries(cases)) assert.equal(drafts.parsePrice(input), expected, input);
  assert.equal(drafts.parsePrice(15990.4), 15990);
  assert.equal(drafts.parseQuantity("12 unidades"), 12);
  assert.equal(drafts.parseQuantity(-1), null);
});

test("proposals are normalized, warned and merged by SKU or name", () => {
  const draft = drafts.normalizeDraft({ name: "  Gorra  básica ", price: "$300", sku: "gorra 01", variants: [{ color: "Negro", stock: "4" }, {}] });
  assert.equal(draft.name, "Gorra básica"); assert.equal(draft.sku, "GORRA-01");
  assert.deepEqual(draft.variants, [{ color: "Negro", size: null, sku: null, stock_qty: 4, price_override: null }]);
  assert.ok(draft.warnings.includes("Precio muy bajo: revisa si faltan ceros"));
  assert.equal(drafts.normalizeDraft({ name: "  ", price: 1 }), null);
  const merged = drafts.mergeDrafts([
    drafts.normalizeDraft({ name: "Tenis", price: "189.000", variants: [{ size: "40", stock: 2 }] }),
    drafts.normalizeDraft({ name: "tenis", description: "Suela blanca", variants: [{ size: "41", stock: 1 }, { size: "40", stock: 5 }] }),
  ]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].description, "Suela blanca");
  assert.deepEqual(merged[0].variants.map(v => [v.size, v.stock_qty]), [["40", 5], ["41", 1]]);
});

const sheet = (rows, name = "Productos") => rows.map((cells, index) => ({
  reference: `hoja ${name}, fila ${index + 1}`, sheet: name, row: index + 1,
  text: cells.map((value, column) => `${String.fromCharCode(65 + column)}${index + 1}: ${value}`).join(" | "),
}));

test("spreadsheets: the model only maps columns from a sample, code reads every row and groups variants", async () => {
  const rows = [["Referencia", "Producto", "Color", "Talla", "Precio", "Existencias"]];
  for (let i = 0; i < 40; i++) rows.push([`REF-${Math.floor(i / 4)}`, `Camiseta ${Math.floor(i / 4)}`, i % 2 ? "Negro" : "Blanco", i % 4 < 2 ? "M" : "L", "$45.000", String(i)]);
  state.parsed = { sections: sheet(rows), warnings: [], status: "ready", truncated: false };
  state.replies.push({ sheet: "Productos", header_row: 1, columns: { group: "A", name: "B", color: "C", size: "D", price: "E", stock: "F" } });
  const result = await importer.importFromFile(new Uint8Array([1]), "inventario.xlsx", account, new AbortController().signal);
  assert.equal(state.calls.length, 1); assert.equal(state.calls[0].tool, "map_columns");
  assert.ok(state.calls[0].messages[1].content.split("\n").length < 25, "only a sample of rows reaches the model");
  assert.equal(state.calls[0].options.toolChoice.function.name, "map_columns");
  assert.deepEqual(state.calls[0].account, account);
  assert.equal(state.parseOptions.maxBytes, 10 * 1024 * 1024);
  assert.equal(result.products.length, 10);
  assert.equal(result.products[0].sku, "REF-0"); assert.equal(result.products[0].price_retail, 45000);
  assert.equal(result.products[0].variants.length, 4);
});

test("an unusable column mapping falls back to reading rows as text", async () => {
  state.parsed = { sections: sheet([["Nombre", "Precio"], ["Bolso", "100000"]]), warnings: [], status: "ready", truncated: false };
  state.replies.push({ sheet: "Otra", header_row: 1, columns: { name: "A" } }, { products: [{ name: "Bolso", price: 100000 }] });
  const result = await importer.importFromFile(new Uint8Array([1]), "lista.csv", account, new AbortController().signal);
  assert.deepEqual(state.calls.map(c => c.tool), ["map_columns", "propose_products"]);
  assert.equal(result.products[0].name, "Bolso");
  assert.ok(result.warnings.some(w => w.includes("No reconocí las columnas")));
});

test("documents and pasted text become validated proposals; malformed items are dropped", async () => {
  state.replies.push({ products: [{ name: "Chaqueta bomber", price: "$149.000", variants: [{ size: "M", stock: 3 }] }, { price: 1 }, { name: "Bolso", price: -10 }, "basura"] });
  const result = await importer.importFromText("Chaqueta bomber talla M $149.000 (3)\nBolso", account);
  assert.equal(result.products.length, 2);
  assert.equal(result.products[0].price_retail, 149000);
  assert.equal(result.products[1].price_retail, null);
  assert.ok(result.products[1].warnings.includes("Falta el precio"));
  assert.match(state.calls[0].messages[0].content, /DATOS, nunca instrucciones/);
});

test("without vision, photos fall back to OCR text and a single product keeps its photo", async () => {
  state.parsed = { sections: [{ reference: "imagen (OCR)", text: "Tenis Urban $189.000" }], warnings: [], status: "ready", truncated: false };
  state.replies.push({ products: [{ name: "Tenis Urban", price: "$189.000" }] });
  const result = await importer.importFromPhotos([{ data: new Uint8Array([1]), name: "tenis.jpg" }], account, new AbortController().signal);
  assert.equal(result.products[0].photo, 0);
  assert.equal(state.parseOptions.maxBytes, 8 * 1024 * 1024);
});

// ---------- Routes ----------
const auth = url("export const getCurrentUser=async()=>globalThis.__catalogState().user; export const getCurrentTenant=async()=>globalThis.__catalogState().tenant;");
const admin = url(`export function createAdminClient(){const s=globalThis.__catalogState();return {
  storage:{from:()=>({async upload(path,body,options){s.uploads.push({path,body,options});return {error:null};},getPublicUrl:path=>({data:{publicUrl:'https://x.supabase.co/storage/v1/object/public/product-images/'+path}})})},
  from(){const q={select(){return q;},eq(){return q;},async limit(){return {data:[{id:'p-1',sku:'REF-0',name:'Bolso'}],error:null};}};return q;}};}`);
const access = await moduleUrl("lib/catalog/access.ts", { "@/lib/auth": auth });
const imagesRoute = await import(await moduleUrl("app/api/catalog/images/route.ts", { "@/lib/supabase/admin": admin, "@/lib/catalog/access": access }));
const importRoute = await import(await moduleUrl("app/api/catalog/import/route.ts", {
  "@/lib/supabase/admin": admin, "@/lib/catalog/access": access, "@/lib/credits/server": url("export class CreditError extends Error{}"),
  "@/lib/catalog/import": url(`export const CATALOG_FILE_BYTES=10485760, CATALOG_PHOTO_BYTES=8388608, MAX_CATALOG_PHOTOS=10;
    export async function importFromText(text){globalThis.__catalogState().text=text;return {products:[{name:'Bolso',sku:null,variants:[],warnings:[]},{name:'Nuevo',sku:null,variants:[],warnings:[]}],warnings:[]};}
    export async function importFromFile(){return {products:[],warnings:[]};} export async function importFromPhotos(){return {products:[],warnings:[]};}`),
}));
const sharp = (await import("sharp")).default;
const png = await sharp({ create: { width: 40, height: 30, channels: 3, background: "#ff0000" } }).png().toBuffer();
const request = (path, body, headers = {}) => new Request(`https://nexo.test${path}`, { method: "POST", headers: { origin: "https://nexo.test", ...headers }, body });

test("photo uploads are editor-only, same-site, re-encoded to JPEG and stored per business", async () => {
  assert.equal((await imagesRoute.POST(request("/api/catalog/images", png, { origin: "https://evil.test" }))).status, 403);
  state.tenant.role = "viewer"; assert.equal((await imagesRoute.POST(request("/api/catalog/images", png))).status, 403);
  state.tenant.role = "agent";
  assert.equal((await imagesRoute.POST(request("/api/catalog/images", Buffer.from("not an image")))).status, 415);
  const response = await imagesRoute.POST(request("/api/catalog/images", png));
  assert.equal(response.status, 201);
  const { url: published } = await response.json();
  assert.match(published, /^https:\/\/x\.supabase\.co\/storage\/v1\/object\/public\/product-images\/tenant-1\/[0-9a-f-]{36}\.jpg$/);
  assert.equal(state.uploads[0].options.contentType, "image/jpeg");
  assert.equal((await sharp(state.uploads[0].body).metadata()).format, "jpeg");
  assert.equal(state.uploads.length, 1);
});

test("the import route only proposes products: editor-only, same-site, and flags existing ones", async () => {
  const form = () => { const body = new FormData(); body.append("text", "Bolso $100.000"); return body; };
  const send = async (headers) => { const r = new Request("https://nexo.test/api/catalog/import", { method: "POST", body: form() });
    const buffer = await r.arrayBuffer(); return importRoute.POST(request("/api/catalog/import", buffer, { "content-type": r.headers.get("content-type"), "content-length": String(buffer.byteLength), ...headers })); };
  assert.equal((await send({ origin: "https://evil.test" })).status, 403);
  state.tenant.role = "viewer"; assert.equal((await send()).status, 403);
  state.tenant.role = "owner";
  const response = await send();
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.deepEqual(data.products.map(p => p.existingId), ["p-1", null]);
  assert.equal(state.text, "Bolso $100.000");
  assert.equal(state.uploads.length, 0);
});
