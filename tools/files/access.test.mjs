import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";
const url = source => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
async function load(path, replacements = {}) {
  let source = await readFile(new URL(path, import.meta.url), "utf8");
  source = source.replace('import "server-only";', "");
  for (const [name, value] of Object.entries(replacements)) source = source.replaceAll(`"${name}"`, JSON.stringify(value));
  return url(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText);
}
const types = await load("../../lib/files/types.ts");
const owner = "33333333-3333-4333-8333-333333333333", other = "44444444-4444-4444-8444-444444444444";
const id = "11111111-1111-4111-8111-111111111111", otherId = "22222222-2222-4222-8222-222222222222";
let state;
beforeEach(() => { state = { user: { id: owner }, rows: new Map(), objects: new Map(), parsed: 0, storageCalls: 0 }; });
globalThis.__fileClient = () => ({ auth: { getUser: async () => ({ data: { user: state.user }, error: state.authError }) } });
globalThis.__fileAdmin = () => ({
  from() {
    const filters = {}, included = {}; let operation = "read", row, updates, single = false;
    const query = {
      select() { return query; }, eq(key, value) { filters[key] = value; return query; }, is(key, value) { filters[key] = value; return query; }, in(key, values) { included[key] = values; return query; }, order() { return query; }, limit() { return query; },
      insert(value) { operation = "insert"; row = value; return query; }, update(value) { operation = "update"; updates = value; return query; }, delete() { operation = "delete"; return query; },
      single() { single = true; return Promise.resolve(result()); }, maybeSingle() { single = true; return Promise.resolve(result()); }, then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); },
    };
    function result() {
      if (state.dbError) return { data: null, error: state.dbError };
      if (operation === "insert") {
        if (state.insertError) return { data: null, error: state.insertError };
        row = { ...row, created_at: new Date().toISOString(), session_id: null, section_count: row.sections.length }; state.rows.set(row.id, row); return { data: row, error: null };
      }
      let rows = [...state.rows.values()].filter(row => Object.entries(filters).every(([key, value]) => row[key] === value) && Object.entries(included).every(([key, values]) => values.includes(row[key])));
      if (operation === "update") { if (state.bindRace) rows = []; else rows.forEach(row => Object.assign(row, updates)); }
      if (operation === "delete") rows.forEach(row => state.rows.delete(row.id));
      return { data: single ? rows[0] ?? null : rows, error: null };
    }
    return query;
  },
  storage: { from() { return {
    async upload(path, content) { state.storageCalls++; if (state.storageError) return { error: {} }; state.objects.set(path, new Blob([content])); return { error: null }; },
    async remove(paths) { state.storageCalls++; paths.forEach(path => state.objects.delete(path)); return { error: state.storageError ? {} : null }; },
    async download(path) { state.storageCalls++; return { data: state.objects.get(path), error: state.objects.has(path) ? null : {} }; },
  }; } },
});
const admin = url("export const createAdminClient = () => globalThis.__fileAdmin();");
const client = url("export const createClient = async () => globalThis.__fileClient();");
const parser = url("export const parseFile = async () => { globalThis.__fileParsed(); return {sections:[{reference:'línea 1',text:'dato'}], warnings:[],status:'ready',truncated:false}; };");
globalThis.__fileParsed = () => { state.parsed++; };
const server = await load("../../lib/files/server.ts", { "@/lib/supabase/admin": admin, "./types": types });
const { loadChatFiles } = await import(server);
const { POST, GET, DELETE } = await import(await load("../../app/api/jarvis/files/route.ts", { "@/lib/supabase/server": client, "@/lib/supabase/admin": admin, "@/lib/files/parser": parser, "@/lib/files/server": server, "@/lib/files/types": types }));
const { GET: download } = await import(await load("../../app/api/jarvis/files/[id]/route.ts", { "@/lib/supabase/server": client, "@/lib/supabase/admin": admin, "@/lib/files/types": types }));
const { POST: ocr } = await import(await load("../../app/api/jarvis/files/[id]/ocr/route.ts", { "@/lib/supabase/server": client, "@/lib/supabase/admin": admin, "@/lib/files/parser": parser, "@/lib/files/server": server, "@/lib/files/types": types }));
const request = (body = "dato", name = "notas.txt", origin = "https://jarvis.example") => new Request("https://jarvis.example/api/jarvis/files", { method: "POST", body, headers: { "X-File-Name": encodeURIComponent(name), Origin: origin } });
function saved(fileId = id, userId = owner, session = null) { const row = { id: fileId, user_id: userId, session_id: session, filename: "ventas.csv", object_path: `${userId}/${fileId}`, byte_size: 4, mime_type: "text/csv", status: "ready", warnings: [], sections: [{ reference: "fila 1", text: "data" }], section_count: 1, truncated: false, created_at: new Date().toISOString() }; state.rows.set(fileId, row); state.objects.set(row.object_path, new Blob(["data"])); return row; }

test("foreign origins, anonymous users and auth failures cannot parse or store uploads", async () => {
  assert.equal((await POST(request("x", "x.txt", "https://other.example"))).status, 403);
  for (const user of [null, { id: owner, is_anonymous: true }]) { state.user = user; assert.equal((await POST(request())).status, 401); }
  state.user = { id: owner }; state.authError = {}; assert.equal((await POST(request())).status, 401);
  assert.equal(state.parsed, 0); assert.equal(state.storageCalls, 0);
});
test("unsupported extensions and oversized streams are rejected before parsing", async () => {
  assert.equal((await POST(request("x", "x.xls"))).status, 415);
  assert.equal((await POST(request(new Uint8Array(3 * 1024 * 1024 + 1)))).status, 413);
  assert.equal((await POST(request(""))).status, 413); assert.equal(state.parsed, 0);
});
test("uploads use server-generated paths and private metadata; failed inserts clean up the object", async () => {
  const response = await POST(request("data", "../ventas.txt")); assert.equal(response.status, 201);
  const file = (await response.json()).file;
  assert.equal(file.name, ".._ventas.txt"); assert.equal(file.references, 1);
  assert.match(response.headers.get("cache-control"), /private, no-store/);
  assert.equal(state.objects.has(`${owner}/${file.id}`), true);
  state.insertError = { message: "file_quota_exhausted" };
  assert.equal((await POST(request())).status, 429); assert.equal(state.objects.size, 1);
});
test("download and deletion hide other users' documents even with a known UUID", async () => {
  saved(otherId, other, "session_other"); saved(id, owner, "session_owner");
  assert.equal((await download(new Request("https://jarvis.example"), { params: Promise.resolve({ id: otherId }) })).status, 404);
  assert.equal((await DELETE(new Request(`https://jarvis.example/api/jarvis/files?id=${otherId}`, { method: "DELETE" }))).status, 404);
  assert.equal(state.storageCalls, 0);
  const response = await download(new Request("https://jarvis.example"), { params: Promise.resolve({ id }) });
  assert.equal(await response.text(), "data"); assert.match(response.headers.get("content-disposition"), /attachment/);
  assert.equal((await DELETE(new Request(`https://jarvis.example/api/jarvis/files?id=${id}`, { method: "DELETE" }))).status, 200);
  assert.equal(state.rows.has(id), false); assert.equal(state.objects.has(`${owner}/${id}`), false); assert.equal(state.rows.has(otherId), true);
});
test("listing recovers unbound uploads and lets the owner manage older files without exposing contents", async () => {
  saved(id, owner, "session_owner"); saved(otherId, other, "session_owner");
  saved("55555555-5555-4555-8555-555555555555", owner);
  saved("66666666-6666-4666-8666-666666666666", owner, "session_old");
  const response = await GET(new Request("https://jarvis.example/api/jarvis/files?sessionId=session_owner"));
  const data = await response.json(); assert.equal(data.files.length, 1); assert.equal(data.files[0].id, id); assert.equal(data.files[0].sections, undefined);
  assert.equal(data.library.length, 3); assert.ok(data.library.some(file => file.sessionId === null));
  assert.ok(data.library.some(file => file.sessionId === "session_old"));
  assert.ok(data.library.every(file => file.sections === undefined && file.id !== otherId));
});
test("binding rejects foreign accounts/sessions and concurrent reassignment; valid files remain available on follow-up", async () => {
  saved(otherId, other); saved(id, owner);
  await assert.rejects(loadChatFiles(owner, "session_owner", [otherId]), /no pertenece/);
  state.rows.get(id).session_id = "session_other";
  await assert.rejects(loadChatFiles(owner, "session_owner", [id]), /no pertenece/);
  state.rows.get(id).session_id = null; state.bindRace = true;
  await assert.rejects(loadChatFiles(owner, "session_owner", [id]), /vincular/);
  state.bindRace = false;
  const first = await loadChatFiles(owner, "session_owner", [id]); assert.equal(first[0].id, id);
  const followup = await loadChatFiles(owner, "session_owner", []); assert.equal(followup[0].sections[0].text, "data");
  await assert.rejects(loadChatFiles(owner, "session_owner", [id, id]), /tres archivos/);
});
test("storage failures report failure rather than inventing an attachment", async () => {
  state.storageError = true; assert.equal((await POST(request())).status, 503); assert.equal(state.rows.size, 0);
  state.dbError = { code: "PGRST205" }; assert.deepEqual(await loadChatFiles(owner, "session_owner", []), []);
});
test("OCR retry checks ownership/auth/origin before reading and updates the existing file only", async () => {
  const context = fileId => ({ params: Promise.resolve({ id: fileId }) });
  const req = origin => new Request("https://jarvis.example/api/jarvis/files/ocr", { method: "POST", headers: origin ? { Origin: origin } : {} });
  const file = saved(); file.filename = "escaneo.pdf"; file.status = "needs_ocr"; file.session_id = "old_session";
  saved(otherId, other).filename = "ajeno.pdf";
  assert.equal((await ocr(req("https://foreign.example"), context(id))).status, 403);
  state.user = null; assert.equal((await ocr(req(), context(id))).status, 401); state.user = { id: owner };
  assert.equal((await ocr(req(), context(otherId))).status, 404); assert.equal(state.parsed, 0); assert.equal(state.storageCalls, 0);
  const response = await ocr(req(), context(id)); assert.equal(response.status, 200);
  assert.equal(file.status, "ready"); assert.equal(file.session_id, "old_session"); assert.equal(file.object_path, `${owner}/${id}`);
  assert.equal(state.objects.size, 2); assert.equal(state.rows.size, 2); assert.equal(state.parsed, 1);
  file.filename = "ventas.xlsx"; assert.equal((await ocr(req(), context(id))).status, 415);
});
