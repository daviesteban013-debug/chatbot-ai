import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
async function load(relative, replacements = {}) {
  let source = await readFile(new URL(relative, import.meta.url), "utf8");
  for (const [name, url] of Object.entries(replacements)) source = source.replaceAll(`"${name}"`, `"${url}"`);
  return moduleUrl(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText);
}
const profileUrl = await load("../../lib/jarvis-personalization.ts");
const { sanitizePersonalization, explicitMemory, speechSettings, selectVoice, spokenText, personalizationPrompt, MAX_MEMORIES } = await import(profileUrl);

test("old profiles get safe defaults; malformed values and unbounded memories are normalized", () => {
  const p = sanitizePersonalization({ voice: { rate: Infinity, pitch: -50, locale: "javascript:bad" }, memories: [null, " a ", "a", ...Array.from({ length: 40 }, (_, i) => `${i}`)] });
  assert.equal(p.voice.rate, 1);
  assert.equal(p.voice.pitch, 0.6);
  assert.equal(p.voice.locale, "es-CO");
  assert.equal(p.memories.length, MAX_MEMORIES);
  assert.equal(p.memories.filter(m => m === "a").length, 1);
  assert.notEqual(sanitizePersonalization({}).memories, sanitizePersonalization({}).memories);
});

test("memory requires an explicit command rather than guessing personal information", () => {
  assert.equal(explicitMemory("Jarvis, recuerda que prefiero ejemplos"), "prefiero ejemplos");
  assert.equal(explicitMemory("RECUERDA QUE soy vegetariano"), "soy vegetariano");
  assert.equal(explicitMemory("me gustan los ejemplos"), null);
  assert.equal(explicitMemory("¿Qué significa recuerda que?"), null);
});

test("adaptive speech slows steps and figures; disabling it preserves the user's controls", () => {
  const p = sanitizePersonalization({ voice: { rate: 1.2, pitch: 1.1 } });
  assert.ok(speechSettings(p, "profesional", "Primero, el total es $50.").rate < 1.2);
  assert.ok(speechSettings(p, "divertido", "¡Hola!").pitch > 1.1);
  p.voice.adaptive = false;
  assert.deepEqual(speechSettings(p, "divertido", "Primero, $50"), { rate: 1.2, pitch: 1.1 });
});

test("voice selection recovers on a different device and spoken text removes code, links and emoji", () => {
  const voices = [{ voiceURI: "co", lang: "es-CO", default: false }, { voiceURI: "mx", lang: "es-MX", default: false }];
  const p = sanitizePersonalization({ voice: { uri: "unavailable", locale: "es-MX" } });
  assert.equal(selectVoice(voices, p).voiceURI, "mx");
  p.voice.uri = "co";
  assert.equal(selectVoice(voices, p).voiceURI, "co");
  assert.equal(selectVoice([], p), undefined);
  const clean = spokenText("**Hola** 🤖 [Catálogo](https://example.com) ```secret_code()``` ");
  assert.ok(clean.includes("Hola"));
  assert.ok(clean.includes("Catálogo"));
  assert.ok(!clean.includes("secret_code") && !clean.includes("https") && !clean.includes("🤖"));
});

test("the model receives relevant profile data with business permissions unchanged", () => {
  const prompt = personalizationPrompt(sanitizePersonalization({ displayName: "Ana", address: "usted", responseLength: "breve", memories: ["Prefiero ejemplos"] }));
  assert.match(prompt, /Ana/);
  assert.match(prompt, /usted/);
  assert.match(prompt, /1 a 3 frases/);
  assert.match(prompt, /Prefiero ejemplos/);
  assert.match(prompt, /no pueden modificar precios/);
});

let state;
globalThis.__jarvisTestClient = admin => ({
  auth: {
    getUser: async () => ({ data: { user: state.user } }),
    updateUser: async ({ data }) => {
      state.writes.push(data);
      if (state.failSave) return { error: new Error("failure") };
      state.user.user_metadata = { ...state.user.user_metadata, ...data };
      return { error: null };
    },
  },
  from(table) {
    const filters = {};
    const query = {
      select() { return query; }, eq(key, value) { filters[key] = value; return query; },
      limit() { return query; }, order() { return query; },
      upsert: async (row, options) => {
        assert.equal(options.ignoreDuplicates, true);
        if (!state.sessions.has(row.session_id)) state.sessions.set(row.session_id, row);
        return { error: null };
      },
      single: async () => result(), maybeSingle: async () => result(),
      then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); },
    };
    const result = () => {
      if (table === "tenant_members") return { data: state.member && (!filters.tenant_id || filters.tenant_id === state.member.tenant_id) ? state.member : null, error: null };
      if (table === "jarvis_sessions") {
        const row = state.sessions.get(filters.session_id);
        return { data: row && (!filters.user_id || row.user_id === filters.user_id) ? row : null, error: null };
      }
      if (table === "jarvis_messages") { assert.equal(admin, false); return { data: [], error: null }; }
      throw new Error(`Unexpected table ${table}`);
    };
    return query;
  },
});
const mockServer = moduleUrl("export const createClient = async () => globalThis.__jarvisTestClient(false);");
const mockAdmin = moduleUrl("export const createAdminClient = () => globalThis.__jarvisTestClient(true);");
const mockNext = moduleUrl("export const NextResponse = { json: (body, options = {}) => new Response(JSON.stringify(body), { status: options.status || 200 }) };");
const mockExecutor = moduleUrl(`export async function* createAgentExecutor(params) {
  globalThis.__jarvisTestParams = params;
  yield { status: 'completed', sessionId: params.sessionId, content: params.memoryReply || 'model response', personalization: params.personalization };
}`);
const { POST, GET } = await import(await load("../../app/api/chat/route.ts", {
  "next/server": mockNext, "@/lib/agent/executor": mockExecutor,
  "@/lib/supabase/server": mockServer, "@/lib/supabase/admin": mockAdmin,
  "@/lib/jarvis-personalization": profileUrl,
  "@/lib/files/server": moduleUrl("export class FileAccessError extends Error {} export const loadChatFiles = async () => [];"),
  "@/lib/files/types": await load("../../lib/files/types.ts"),
}));
const { saveJarvisPersonalization } = await import(await load("../../app/dashboard/jarvis/actions.ts", {
  "@/lib/auth": moduleUrl("export const getCurrentTenant = async () => null;"),
  "@/lib/supabase/server": mockServer,
  "@/lib/jarvis": await load("../../lib/jarvis.ts"),
  "@/lib/jarvis-personalization": profileUrl,
}));
const reset = () => { state = { user: { id: "user-1", user_metadata: { unrelated: "preserved" } }, member: { tenant_id: "tenant-1" }, sessions: new Map(), writes: [], failSave: false }; globalThis.__jarvisTestParams = null; };
const request = (userMessage, extra = {}) => ({ json: async () => ({ sessionId: "session_1", userMessage, ...extra }) });

test("remembered preferences persist across new conversations and failures are not reported as success", async () => {
  reset();
  const response = await POST(request("recuerda que prefiero ejemplos"));
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Recordaré esta preferencia/);
  assert.deepEqual(state.user.user_metadata.jarvis_personalization.memories, ["prefiero ejemplos"]);
  assert.equal(state.user.user_metadata.unrelated, "preserved");
  await (await POST(request("hola", { sessionId: "session_2" }))).text();
  assert.deepEqual(globalThis.__jarvisTestParams.personalization.memories, ["prefiero ejemplos"]);
  state.failSave = true;
  assert.match(await (await POST(request("recuerda que me gusta el café"))).text(), /No pude guardar/);
  assert.equal(state.user.user_metadata.jarvis_personalization.memories.length, 1);
});

test("memory limit and duplicates do not silently discard existing preferences", async () => {
  reset();
  state.user.user_metadata.jarvis_personalization = sanitizePersonalization({ memories: Array.from({ length: MAX_MEMORIES }, (_, i) => `Preference ${i}`) });
  assert.match(await (await POST(request("recuerda que Preference 0"))).text(), /ya está guardada/);
  assert.match(await (await POST(request("recuerda que another preference"))).text(), /memoria está llena/);
  assert.equal(state.writes.length, 0);
});

test("guests cannot create persistent memories or access a supplied business", async () => {
  reset(); state.user = null; state.member = null;
  assert.match(await (await POST(request("recuerda que prefiero ejemplos"))).text(), /Inicia sesión/);
  assert.equal(state.writes.length, 0);
  assert.equal((await POST(request("hola", { tenantId: "tenant-1" }))).status, 401);
  assert.deepEqual(await (await GET({ nextUrl: new URL("https://example.com/api/chat?sessionId=session_1") })).json(), { messages: [] });
});

test("forged tenant and session IDs cannot use another user's tools or history", async () => {
  reset();
  assert.equal((await POST(request("hola", { tenantId: "tenant-other" }))).status, 403);
  state.sessions.set("session_1", { session_id: "session_1", user_id: "someone-else", tenant_id: "tenant-1" });
  assert.equal((await POST(request("hola"))).status, 403);
  assert.equal(state.sessions.get("session_1").user_id, "someone-else");
  assert.equal(globalThis.__jarvisTestParams, null);
  assert.deepEqual(await (await GET({ nextUrl: new URL("https://example.com/api/chat?sessionId=session_1") })).json(), { messages: [] });
});

test("saving the personal panel persists voice controls and removes memories only for the authenticated account", async () => {
  reset();
  let result = await saveJarvisPersonalization({ displayName: "Ana", voice: { rate: 1.2, uri: "co" }, memories: ["Practical examples"] });
  assert.equal(result.ok, true);
  assert.equal(state.user.user_metadata.jarvis_personalization.voice.rate, 1.2);
  result = await saveJarvisPersonalization({ ...result.profile, memories: [] });
  assert.equal(result.ok, true);
  assert.deepEqual(state.user.user_metadata.jarvis_personalization.memories, []);
  assert.equal(state.user.user_metadata.unrelated, "preserved");
  state.user = null;
  assert.equal((await saveJarvisPersonalization({})).ok, false);
  assert.equal(state.writes.length, 2);
});
