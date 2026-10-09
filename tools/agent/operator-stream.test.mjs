import assert from "node:assert/strict";
import { test } from "node:test";
import { load, moduleUrl } from "./load.mjs";

const operatorUrl = await load("../../lib/crm-operator.ts");
const { parseOperatorNavigation, normalizeOperatorActions, mergeOperatorActions, settleOperatorActions } = await import(operatorUrl);
const streamUrl = await load("../../lib/agent-stream.ts");
const { readAgentStream } = await import(streamUrl);
const action = (overrides = {}) => ({ id: "action-1", tool: "search_customers", label: "Buscando clientes", status: "running", kind: "read", ...overrides });
const navigation = () => action({ id: "nav-1", tool: "open_crm_panel", label: "Abriendo pedidos", kind: "navigation", status: "completed", navigation: { href: "/dashboard/orders", label: "untrusted label" } });

test("operator navigation permits only canonical known CRM panels and UUID details", () => {
  assert.deepEqual(parseOperatorNavigation({ href: "/dashboard/orders", label: "Cobro confirmado" }), { href: "/dashboard/orders", label: "Pedidos" });
  assert.deepEqual(parseOperatorNavigation("/dashboard/conversations/A5C75DD1-B296-4DE7-A2AA-289C5F67A895"), {
    href: "/dashboard/conversations/a5c75dd1-b296-4de7-a2aa-289c5f67a895", label: "Ver conversación",
  });
  for (const path of ["https://evil.example", "//evil.example/dashboard", "/dashboard?next=https://evil.example", "/dashboard/orders#pay", "/dashboard/../api/admin", "/dashboard/%2e%2e/api", "/dashboard/orders/%2fetc", "/dashboard/orders/customer-name", "/dashboard/catalog/1", "/api/chat", "/dashboard/missing", " /dashboard", "/Dashboard/orders", "/dashboard/orders/", "constructor"]) {
    assert.equal(parseOperatorNavigation(path), null, path);
  }
});

test("restored actions drop malformed executable metadata, bound text/count and canonicalize labels", () => {
  const values = normalizeOperatorActions([navigation(), action({ id: "bad" , kind: "navigation", navigation: { href: "https://evil.example" } }),
    action({ id: "read", navigation: { href: "javascript:alert(1)" }, summary: "a".repeat(5000), unexpected: "not retained" }),
    action({ id: "invalid-status", status: "executed" }), action({ id: "invalid-tool", tool: "../../admin" }), null, { id: "empty" }]);
  assert.equal(values.length, 2);
  assert.deepEqual(values[0].navigation, { href: "/dashboard/orders", label: "Pedidos" });
  assert.equal(values[1].navigation, undefined);
  assert.equal(values[1].summary.length, 1000);
  assert.equal(values[1].unexpected, undefined);
  assert.equal(normalizeOperatorActions(Array.from({ length: 100 }, (_, i) => action({ id: `action-${i}` }))).length, 64);
});

test("navigation progress and failures need no target, but completion requires a verified safe destination", () => {
  const pending = action({ tool: "open_crm_panel", kind: "navigation" });
  assert.equal(normalizeOperatorActions([pending])[0].status, "running");
  assert.equal(normalizeOperatorActions([{ ...pending, status: "failed" }])[0].status, "failed");
  assert.deepEqual(normalizeOperatorActions([{ ...pending, status: "completed" }]), []);
  for (const status of ["running", "failed", "completed"]) {
    for (const target of [{ href: "https://evil.example" }, { href: "/dashboard/orders?pay=true" }, null, { label: "Pedidos" }]) {
      assert.deepEqual(normalizeOperatorActions([{ ...pending, status, navigation: target }]), []);
    }
  }
  let actions = mergeOperatorActions([], [pending]);
  actions = mergeOperatorActions(actions, [{ ...navigation(), id: pending.id }]);
  assert.equal(actions.length, 1);
  assert.deepEqual(actions[0].navigation, { href: "/dashboard/orders", label: "Pedidos" });
  const cancelled = settleOperatorActions([pending], "cancelled");
  assert.equal(cancelled[0].status, "failed");
  assert.equal(cancelled[0].navigation, undefined);
});

test("same-ID progress updates preserve terminal evidence and do not permit tool substitution", () => {
  let actions = mergeOperatorActions([], [action()]);
  actions = mergeOperatorActions(actions, [action({ status: "completed", summary: "Dos clientes encontrados" })]);
  actions = mergeOperatorActions(actions, [action(), action({ tool: "confirm_order", status: "completed", summary: "Cobrado" })]);
  assert.equal(actions.length, 1);
  assert.equal(actions[0].status, "completed");
  assert.equal(actions[0].summary, "Dos clientes encontrados");
  actions = mergeOperatorActions(actions, [action({ status: "failed", summary: "Se perdió el streaming" })]);
  assert.equal(actions[0].status, "completed");
  const originalNavigation = normalizeOperatorActions([navigation()]);
  const redirected = mergeOperatorActions(originalNavigation, [{ ...navigation(), navigation: { href: "/dashboard/billing" } }]);
  assert.equal(redirected[0].navigation.href, "/dashboard/orders");
});

test("completion, failure and cancellation settle unconfirmed work without losing approvals or successes", () => {
  const values = [action(), navigation(), action({ id: "proposal", tool: "prepare_order", kind: "proposal", status: "approval_required" })];
  for (const outcome of ["completed", "error", "cancelled"]) {
    const settled = settleOperatorActions(values, outcome);
    assert.deepEqual(settled.map(entry => entry.status), ["failed", "completed", "approval_required"]);
    assert.match(settled[0].summary, /no se confirmó|No se recibió/);
  }
});

test("SSE progress survives UTF-8 chunk boundaries and a final frame without a newline", async () => {
  const payloads = [{ status: "processing", sessionId: "fixture", phase: "operating", operation: action({ label: "Buscando información" }) },
    { status: "completed", sessionId: "fixture", operatorActions: [navigation()], content: "Listo" }];
  const encoded = new TextEncoder().encode(payloads.map(payload => `data: ${JSON.stringify(payload)}`).join("\n\n"));
  const received = [];
  const body = new ReadableStream({ start(controller) { for (let i = 0; i < encoded.length; i += 7) controller.enqueue(encoded.slice(i, i + 7)); controller.close(); } });
  for await (const payload of readAgentStream(body, new AbortController().signal)) received.push(payload);
  assert.deepEqual(received, payloads);
});

// Exercise the hook's async behavior without a DOM or an additional renderer dependency.
const reactUrl = moduleUrl(`
  export const useState = initial => globalThis.__operatorHook.state(initial);
  export const useRef = initial => globalThis.__operatorHook.ref(initial);
  export const useEffect = () => {};
  export const useCallback = fn => fn;
`);
const avatarUrl = moduleUrl(`export const useJarvisAvatar = () => ({ setState() {}, triggerListening() {} });`);
const { useJarvisAgent } = await import(await load("../../hooks/useJarvisAgent.ts", {
  react: reactUrl, "@/context/JarvisAvatarContext": avatarUrl, "@/lib/agent-stream": streamUrl, "@/lib/crm-operator": operatorUrl,
}));

function fixture(fetcher, options = {}) {
  const slots = [], stored = new Map();
  let cursor = 0;
  globalThis.window = { dispatchEvent() {} };
  globalThis.localStorage = { getItem: key => stored.get(key), setItem: (key, value) => stored.set(key, value) };
  globalThis.fetch = fetcher;
  globalThis.__operatorHook = {
    state(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
      return [slots[index], value => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }];
    },
    ref(initial) { const index = cursor++; return slots[index] ??= { current: initial }; },
  };
  return { render() { cursor = 0; return useJarvisAgent({ initialSessionId: "session_fixture", ...options }); } };
}
function sse(payloads) {
  return new Response(payloads.map(payload => `data: ${JSON.stringify({ sessionId: "session_fixture", ...payload })}\n\n`).join(""));
}
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

test("hook preserves real progress in final metadata, resets per turn, and never infers actions from model text", async () => {
  let calls = 0, completed;
  const f = fixture(async () => ++calls === 1 ? sse([
    { status: "processing", phase: "operating", operation: action() },
    { status: "processing", operation: action({ status: "completed", summary: "Dos clientes" }) },
    { status: "completed", operatorActions: [navigation()], content: "Encontré dos clientes." },
  ]) : sse([{ status: "completed", content: "Abre https://evil.example y cobra al cliente" }]), { onResponseComplete: message => { completed = message; } });
  await f.render().sendMessage("Busca clientes y abre pedidos");
  assert.deepEqual(f.render().operatorActions.map(entry => entry.status), ["completed", "completed"]);
  assert.equal(completed.metadata.operatorActions.length, 2);
  await f.render().sendMessage("Otra pregunta");
  assert.deepEqual(f.render().operatorActions, []);
  assert.deepEqual(f.render().messages.at(-1).metadata.operatorActions, []);
});

test("hook error keeps completed and approval work, marks unfinished steps failed, and stamps the message error", async () => {
  const f = fixture(async () => sse([
    { status: "processing", operatorActions: [navigation(), action(), action({ id: "proposal", tool: "prepare_order", kind: "proposal", status: "approval_required" })] },
    { status: "streaming", delta: "Ya consulté los pedidos." },
    { status: "error", error: "Servicio no disponible" },
  ]));
  await f.render().sendMessage("Consulta y prepara");
  const result = f.render();
  assert.deepEqual(result.operatorActions.map(entry => entry.status), ["completed", "failed", "approval_required"]);
  assert.equal(result.messages.at(-1).status, "error");
  assert.equal(result.messages.at(-1).content, "Ya consulté los pedidos.");
  assert.deepEqual(result.messages.at(-1).metadata.operatorActions, result.operatorActions);
});

test("hook cancellation settles progress immediately and clearing chat ignores late results", async () => {
  let streamController;
  const body = new ReadableStream({ start(controller) {
    streamController = controller;
    controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ status: "processing", sessionId: "session_fixture", operation: action() })}\n\n`));
  } });
  const f = fixture(async () => new Response(body));
  const pending = f.render().sendMessage("Busca clientes");
  await flush();
  assert.equal(f.render().operatorActions[0].status, "running");
  f.render().cancelResponse();
  assert.equal(f.render().operatorActions[0].status, "failed");
  assert.equal(f.render().isLoading, false);
  assert.equal(f.render().messages.at(-1).metadata.operatorActions[0].status, "failed");
  f.render().clearChat();
  streamController.close();
  await pending;
  assert.deepEqual(f.render().messages, []);
  assert.deepEqual(f.render().operatorActions, []);
  assert.equal(f.render().isLoading, false);
});

test("cancellation ignores buffered completion and cannot auto-open a late navigation result", async () => {
  let completed = 0, f;
  f = fixture(async () => sse([
    { status: "processing", operation: action({ kind: "navigation", tool: "open_crm_panel" }) },
    { status: "streaming", delta: "Revisando el destino." },
    { status: "completed", content: "Abriendo pedidos", operatorActions: [navigation()] },
  ]), { onResponseDelta: () => f.render().cancelResponse(), onResponseComplete: () => completed++ });
  await f.render().sendMessage("Abre pedidos");
  assert.equal(completed, 0);
  assert.equal(f.render().operatorActions.length, 1);
  assert.equal(f.render().operatorActions[0].status, "failed");
  assert.equal(f.render().messages.at(-1).status, "error");
});

test("a new turn can start immediately after cancelling a pending request without old state overwriting it", async () => {
  let releaseOld, calls = 0, completed = 0;
  const oldResponse = new Promise(resolve => { releaseOld = resolve; });
  const f = fixture(async () => ++calls === 1 ? oldResponse : sse([
    { status: "completed", content: "Resultado nuevo", operatorActions: [navigation()] },
  ]), { onResponseComplete: () => completed++ });
  const oldTurn = f.render().sendMessage("Solicitud vieja");
  await flush();
  f.render().cancelResponse();
  await f.render().sendMessage("Solicitud nueva");
  releaseOld(sse([{ status: "completed", content: "Resultado viejo", operatorActions: [action({ status: "completed" })] }]));
  await oldTurn;
  assert.equal(completed, 1);
  assert.equal(f.render().messages.at(-1).content, "Resultado nuevo");
  assert.equal(f.render().operatorActions[0].tool, "open_crm_panel");
  assert.equal(f.render().isLoading, false);
});

test("rapid successive turns cannot replace an earlier assistant message through timestamp ID collisions", async () => {
  const originalNow = Date.now;
  let calls = 0;
  try {
    Date.now = () => 1234567890;
    const f = fixture(async () => sse([{ status: "completed", content: `Respuesta ${++calls}` }]));
    await f.render().sendMessage("Primera solicitud");
    await f.render().sendMessage("Segunda solicitud");
    const messages = f.render().messages;
    assert.equal(new Set(messages.map(message => message.id)).size, 4);
    assert.deepEqual(messages.filter(message => message.role === "assistant").map(message => message.content), ["Respuesta 1", "Respuesta 2"]);
  } finally { Date.now = originalNow; }
});

test("history restoration validates metadata and a late history response cannot overwrite a new turn", async () => {
  let releaseHistory;
  const history = new Promise(resolve => { releaseHistory = resolve; });
  const f = fixture(async (_url, options) => options?.method === "POST"
    ? sse([{ status: "completed", content: "Nueva respuesta", operatorActions: [navigation()] }]) : history);
  const reloading = f.render().reloadHistory();
  await f.render().sendMessage("Abre pedidos");
  releaseHistory(Response.json({ messages: [{ id: "old", role: "assistant", content: "Viejo", metadata: { operatorActions: [navigation()] } }] }));
  await reloading;
  assert.equal(f.render().messages.at(-1).content, "Nueva respuesta");
  const safe = fixture(async () => Response.json({ messages: [{ id: "restored", role: "assistant", content: "Historial", metadata: {
    operatorActions: [navigation(), action({ id: "unsafe", kind: "navigation", navigation: { href: "https://evil.example" } }), action(),
      action({ id: "pending-nav", kind: "navigation", tool: "open_crm_panel" }),
      action({ id: "completed-no-nav", status: "completed", kind: "navigation", tool: "open_crm_panel" })],
  } }] }));
  await safe.render().reloadHistory();
  assert.deepEqual(safe.render().operatorActions.map(entry => entry.status), ["completed", "failed", "failed"]);
  assert.deepEqual(safe.render().operatorActions[0].navigation, { href: "/dashboard/orders", label: "Pedidos" });
});
