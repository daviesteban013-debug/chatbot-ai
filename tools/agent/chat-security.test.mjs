import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { load, moduleUrl } from "./load.mjs";

let state;
beforeEach(() => {
  state = { user: { id: "user-a" }, member: { tenant_id: "tenant-a", role: "viewer" }, calls: [], updates: [], sessions: new Map(), params: null };
});
globalThis.__chatSecurityClient = admin => {
  state.calls.push(admin ? "admin" : "server");
  return {
    auth: {
      getUser: async () => {
        if (state.authError) throw new Error("private-auth-credential");
        return { data: { user: state.user } };
      },
      updateUser: async value => { state.updates.push(value); return { error: null }; },
    },
    from(table) {
      const filters = {};
      let descending = false, maxRows = Infinity;
      const query = {
        select() { return query; }, eq(key, value) { filters[key] = value; return query; },
        order(column, options) { if (column === "created_at") descending = options?.ascending === false; return query; }, limit(value) { maxRows = value; return query; },
        upsert: async row => {
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
          return { data: row && (!filters.user_id || filters.user_id === row.user_id) ? row : null, error: null };
        }
        if (table === "jarvis_messages") return { data: [...(state.historyMessages ?? [])].sort((a, b) => descending ? b.created_at.localeCompare(a.created_at) : a.created_at.localeCompare(b.created_at)).slice(0, maxRows), error: state.historyError ? { message: "private-database-credential" } : null };
        throw new Error(`Unexpected fixture table ${table}`);
      };
      return query;
    },
  };
};
globalThis.__chatSecurityExecutor = async function* (params) {
  state.params = params;
  if (state.streamError) throw new Error("private-provider-credential");
  yield { status: "completed", content: "Resultado confirmado", sessionId: params.sessionId };
};
const { GET, POST } = await import(await load("../../app/api/chat/route.ts", {
  "next/server": moduleUrl("export const NextResponse={json:(data,init)=>Response.json(data,init)};"),
  "@/lib/agent/executor": moduleUrl("export const createAgentExecutor=(...args)=>globalThis.__chatSecurityExecutor(...args);"),
  "@/lib/supabase/server": moduleUrl("export const createClient=async()=>globalThis.__chatSecurityClient(false);"),
  "@/lib/supabase/admin": moduleUrl("export const createAdminClient=()=>globalThis.__chatSecurityClient(true);"),
  "@/lib/jarvis-personalization": await load("../../lib/jarvis-personalization.ts"),
  "@/lib/files/server": moduleUrl("export class FileAccessError extends Error {} export const loadChatFiles=async()=>[];"),
  "@/lib/files/types": await load("../../lib/files/types.ts"),
}));
const origin = "https://nexo.test";
const body = { sessionId: "session_a", userMessage: "Consulta mis pedidos" };
function request(value = body, options = {}) {
  const headers = new Headers({ origin, "content-type": "application/json", ...options.headers });
  if (options.noOrigin) headers.delete("origin");
  const result = new Request(origin + "/api/chat", {
    method: "POST", headers,
    body: options.raw ?? JSON.stringify(value),
    ...(options.raw instanceof ReadableStream ? { duplex: "half" } : {}),
  });
  result.nextUrl = new URL(result.url);
  return result;
}

test("missing/foreign/null origin and cross-site requests cannot consume tokens or update memory", async () => {
  const memory = { ...body, userMessage: "recuerda que prefiero ejemplos" };
  for (const options of [{ noOrigin: true }, { headers: { origin: "https://evil.test" } }, { headers: { origin: "null" } }, { headers: { origin: origin + "/" } }, { headers: { "sec-fetch-site": "cross-site" } }]) {
    assert.equal((await POST(request(memory, options))).status, 403);
  }
  assert.deepEqual(state.calls, []);
  assert.deepEqual(state.updates, []);
  assert.equal(state.params, null);
});

test("same-origin authenticated requests use server membership and ignore a supplied role", async () => {
  const response = await POST(request({ ...body, role: "owner", userId: "other-user" }, { headers: { "sec-fetch-site": "same-origin" } }));
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Resultado confirmado/);
  assert.equal(state.params.userId, "user-a");
  assert.equal(state.params.role, "viewer");
  assert.equal(state.params.tenantId, "tenant-a");
});

test("business memories go to reviewed CRM tools; explicit private preferences remain personal", async () => {
  const business = await POST(request({ ...body, userMessage: "recuerda que Ana prefiere entrega por la mañana" }));
  assert.equal(business.status, 200); await business.text();
  assert.equal(state.params.memoryReply, undefined); assert.equal(state.updates.length, 0);
  const personal = await POST(request({ ...body, userMessage: "NEXO, recuerda sobre mí que prefiero ejemplos" }));
  assert.equal(personal.status, 200); await personal.text();
  assert.match(state.params.memoryReply, /Recordaré esta preferencia/); assert.equal(state.updates.length, 1);
});

test("same-origin anonymous demo still runs without CRM tools; supplied tenant is forbidden", async () => {
  state.user = null; state.member = null;
  const response = await POST(request());
  assert.equal(response.status, 200);
  await response.text();
  assert.equal(state.params.userId, null);
  assert.equal(state.params.tenantId, null);
  assert.equal(state.params.role, null);
  state.params = null;
  assert.equal((await POST(request({ ...body, tenantId: "tenant-a" }))).status, 401);
  assert.equal(state.params, null);
});

test("non-JSON, malformed JSON, invalid UTF-8 and non-object payloads fail before authentication", async () => {
  for (const value of [null, [], 42, "hello"]) assert.equal((await POST(request(value))).status, 400);
  for (const options of [{ raw: "{" }, { raw: new Uint8Array([0xff]) }, { headers: { "content-type": "text/plain" } }])
    assert.equal((await POST(request(body, options))).status, 400);
  assert.deepEqual(state.calls, []);
});

test("body bounds count bytes, reject large declarations and cannot be bypassed by missing/false length", async () => {
  assert.equal((await POST(request(body, { headers: { "content-length": "65537" } }))).status, 413);
  const raw = JSON.stringify({ ...body, padding: "é".repeat(33000) });
  assert.ok(raw.length < 65536);
  assert.ok(new TextEncoder().encode(raw).byteLength > 65536);
  for (const headers of [{}, { "content-length": "1" }]) assert.equal((await POST(request(body, { raw, headers }))).status, 413);
  assert.deepEqual(state.calls, []);
});

test("oversized streaming request is canceled without buffering the rest or executing the agent", async () => {
  let canceled = false;
  const raw = new ReadableStream({
    pull(controller) { controller.enqueue(new Uint8Array(20000)); },
    cancel() { canceled = true; },
  });
  assert.equal((await POST(request(body, { raw }))).status, 413);
  assert.equal(canceled, true);
  assert.deepEqual(state.calls, []);
  assert.equal(state.params, null);
});

test("unexpected auth, database and provider exceptions never expose private error details", async () => {
  state.authError = true;
  const auth = await POST(request());
  assert.equal(auth.status, 503);
  assert.doesNotMatch(await auth.text(), /private-auth/);
  state.authError = false;
  state.sessions.set(body.sessionId, { session_id: body.sessionId, tenant_id: "tenant-a", user_id: "user-a" });
  state.historyError = true;
  const get = request();
  get.nextUrl.searchParams.set("sessionId", body.sessionId);
  const history = await GET(get);
  assert.equal(history.status, 503);
  assert.doesNotMatch(await history.text(), /private-database/);
  state.streamError = true;
  const streaming = await POST(request());
  const result = await streaming.text();
  assert.match(result, /"status":"error"/);
  assert.doesNotMatch(result, /private-provider/);
});

test("history restores the latest fifty messages chronologically, retaining the latest operator result", async () => {
  state.sessions.set(body.sessionId, { session_id: body.sessionId, tenant_id: "tenant-a", user_id: "user-a" });
  state.historyMessages = Array.from({ length: 60 }, (_, index) => ({ id: `message-${index + 1}`, role: "assistant", content: `Result ${index + 1}`, created_at: new Date(1700000000000 + index * 1000).toISOString(), status: "completed", metadata: { operatorActions: index === 59 ? [{ id: "latest-step", tool: "open_crm_panel", kind: "navigation", status: "completed", navigation: { href: "/dashboard/orders" } }] : [] } }));
  const get = request(); get.nextUrl.searchParams.set("sessionId", body.sessionId);
  const response = await GET(get);
  assert.equal(response.status, 200);
  const { messages } = await response.json();
  assert.equal(messages.length, 50);
  assert.equal(messages[0].id, "message-11");
  assert.equal(messages.at(-1).id, "message-60");
  assert.equal(messages.at(-1).metadata.operatorActions[0].id, "latest-step");
});
