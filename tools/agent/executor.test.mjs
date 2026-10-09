import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { load, moduleUrl } from "./load.mjs";
let state;
beforeEach(() => { state = { calls: [], specialistCalls: [], toolCalls: [], rows: [], history: [], mode: "chain", userSaveError: false, assistantSaveError: false }; });
globalThis.__agentDb = () => ({ from(table) {
  let inserted;
  const query = {
    insert(row) { inserted = row; state.rows.push(row); return query; },
    select() { return query; }, eq() { return query; }, order() { return query; }, limit() { return query; }, abortSignal() { return query; },
    maybeSingle: async () => ({ data: null, error: null }),
    single: async () => ({ data: { id: "saved" }, error: state.assistantSaveError ? { message: "private" } : null }),
    then(resolve, reject) { return Promise.resolve({ data: inserted ? null : table === "jarvis_messages" ? structuredClone(state.history) : [], error: inserted?.role === "user" && state.userSaveError ? { message: "private" } : null }).then(resolve, reject); },
  }; return query;
} });
const toolCall = (name, args = {}) => ({ id: `call-${state.calls.length}`, function: { name, arguments: typeof args === "string" ? args : JSON.stringify(args) } });
globalThis.__agentStream = async function* (account, messages, tools, options) {
  state.calls.push({ account, messages: structuredClone(messages), tools, options });
  if (state.mode === "chain" && state.calls.length <= 2) {
    yield { type: "delta", content: "Una afirmación provisional que no debe escucharse." };
    yield { type: "tool_calls", toolCalls: [state.calls.length === 1 ? toolCall("delegate_to_agent", { agent: "clientes", task: "Busca a Ana" }) : toolCall("delegate_to_agent", { agent: "pedidos", task: "Consulta los pedidos de customer-a" })] };
  } else if (state.mode === "malicious" && state.calls.length === 1) {
    yield { type: "tool_calls", toolCalls: [toolCall("confirm_order", { order_id: "existing-order" })] };
  } else if (state.mode === "invalid" && state.calls.length === 1) {
    yield { type: "tool_calls", toolCalls: [toolCall("delegate_to_agent", "null")] };
  } else if (state.mode === "loop" && tools) {
    yield { type: "tool_calls", toolCalls: [toolCall("delegate_to_agent", { agent: "clientes", task: "Busca a Ana" })] };
  } else if (state.mode === "overflow" && tools) {
    yield { type: "tool_calls", toolCalls: Array.from({ length: 13 }, () => toolCall("delegate_to_agent", { agent: "clientes", task: "Busca a Ana" })) };
  } else yield { type: "delta", content: "Ana tiene un pedido pendiente." };
  yield { type: "done", model: "test-model", tokensIn: 20, tokensOut: 10 };
};
globalThis.__agentTool = async (name, args, context) => {
  state.toolCalls.push({ name, args, context });
  return { ok: true, data: name === "search_customers" ? { customers: [{ id: "customer-a", name: "Ana" }] } : { orders: [{ id: "order-a", status: "pending_payment" }] } };
};
const webTools = moduleUrl("export const webCrmTools=(tenant,role)=>tenant&&role?['search_customers','list_orders'].map(name=>({type:'function',function:{name}})):[]; export const executeWebToolCall=(...args)=>globalThis.__agentTool(...args);");
globalThis.__specialistComplete = async (account, messages, tools, options) => {
  state.specialistCalls.push({ account, messages: structuredClone(messages), tools, options });
  const evidence = messages.filter(message => message.role === "tool");
  return { content: evidence.length ? "Consulta confirmada." : null,
    toolCalls: evidence.length || !tools ? [] : [{ ...toolCall(tools[0].function.name,
      tools[0].function.name === "search_customers" ? { query: "Ana" } : { customer_id: "customer-a" }), type: "function" }],
    model: "test-model", tokensIn: 15, tokensOut: 5, latencyMs: 1 };
};
const team = await load("../../lib/agent/team.ts", { zod: import.meta.resolve("zod") });
const { createAgentExecutor } = await import(await load("../../lib/agent/executor.ts", {
  "@/lib/supabase/admin": moduleUrl("export const createAdminClient=()=>globalThis.__agentDb();"),
  "@/lib/llm": moduleUrl("export const calculateCost=()=>0; export const configuredModel=()=> 'test-model';"),
  "@/lib/llm/metered": moduleUrl("export const meteredChatCompletionStream=(...args)=>globalThis.__agentStream(...args); export const meteredChatCompletion=(...args)=>globalThis.__specialistComplete(...args);"),
  "./web-tools": webTools,
  "./team": team,
  "./order-actions": moduleUrl("export const createOrderPreparation=()=>({tools:[],proposals:[],execute:async()=>({ok:false})});"),
  "@/lib/jarvis": await load("../../lib/jarvis.ts"),
  "@/lib/jarvis-personalization": await load("../../lib/jarvis-personalization.ts"),
  "@/lib/files/tools": moduleUrl("export const FILE_TOOLS=[];export const fileContext=()=>'';export const executeFileTool=()=>{throw new Error('not expected')};"),
}));
const run = async (extra = {}) => {
  const events = [];
  for await (const event of createAgentExecutor({ sessionId: "session-a", userId: "auth-user-a", tenantId: "business-a", role: "owner", userMessage: "Busca a Ana y sus pedidos", ...extra })) events.push(event);
  return events;
};

test("CRM queries chain across model rounds, meter every round and speak only the confirmed final answer", async () => {
  const events = await run();
  assert.deepEqual(state.toolCalls.map(call => call.name), ["search_customers", "list_orders"]);
  assert.equal(state.calls.length, 3);
  assert.equal(JSON.parse(state.calls[1].messages.find(message => message.role === "tool").content).data.evidence[0].result.data.customers[0].id, "customer-a");
  assert.equal(state.calls[2].messages.filter(message => message.role === "tool").length, 2);
  assert.ok(state.calls.every(call => call.account.tenantId === "business-a" && call.account.channel === "web" && call.options.signal));
  assert.equal(state.toolCalls[0].context.customerId, undefined); assert.equal(state.toolCalls[0].context.conversationId, undefined);
  assert.equal(events.filter(event => event.status === "streaming").map(event => event.delta).join(""), "Ana tiene un pedido pendiente.");
  assert.equal(events.at(-1).status, "completed");
  const saved = state.rows.at(-1); assert.equal(saved.tokens_in, 120); assert.equal(saved.tokens_out, 50);
  assert.deepEqual(saved.metadata.handoffs.map(handoff => [handoff.agent, handoff.status]), [["clientes", "completed"], ["pedidos", "completed"]]);
  assert.ok(events.some(event => event.phase === "delegating" && event.agent === "clientes"));
  assert.ok(state.specialistCalls[2].messages.some(message => message.content?.includes("customer-a")));
  assert.deepEqual(saved.metadata.toolTrace, [{ name: "delegate_to_agent", ok: true }, { name: "delegate_to_agent", ok: true }]);
});

test("invented write calls and malformed JSON are blocked at execution, not merely hidden in the tool definitions", async () => {
  for (const mode of ["malicious", "invalid"]) {
    state.calls = []; state.mode = mode;
    const events = await run();
    assert.equal(events.at(-1).status, "completed");
    const result = JSON.parse(state.calls[1].messages.find(message => message.role === "tool").content);
    assert.equal(result.ok, false); assert.equal(state.toolCalls.length, 0);
  }
});

test("repeated delegations share a twelve-call budget and leave NEXO a final evidence-only round", async () => {
  state.mode = "loop";
  const events = await run();
  assert.equal(state.calls.length + state.specialistCalls.length, 12); assert.equal(state.toolCalls.length, 4);
  assert.equal(state.calls.at(-1).tools, undefined); assert.equal(events.at(-1).status, "completed");
  assert.equal(state.rows.at(-1).tokens_in, state.calls.length * 20 + state.specialistCalls.length * 15);
});

test("oversized tool batches are rejected before any query executes", async () => {
  state.mode = "overflow";
  const events = await run();
  assert.equal(state.toolCalls.length, 0); assert.equal(state.calls.length, 1);
  assert.match(events.at(-1).content, /límite/);
});

test("repeating the same question does not erase previous user or assistant messages", async () => {
  state.mode = "text";
  state.history = [{ role: "assistant", content: "Respuesta anterior" }, { role: "user", content: "Busca a Ana y sus pedidos" }];
  await run();
  assert.equal(state.calls[0].messages.filter(message => message.content === "Busca a Ana y sus pedidos").length, 2);
});

test("failed persistence is reported as failure; a failed user insert never consumes model tokens", async () => {
  state.userSaveError = true;
  assert.equal((await run()).at(-1).status, "error"); assert.equal(state.calls.length, 0);
  state.userSaveError = false; state.assistantSaveError = true;
  const events = await run();
  assert.equal(events.at(-1).status, "error"); assert.match(events.at(-1).error, /no pudo guardarse/);
  assert.ok(!events.some(event => event.status === "completed"));
});

test("canceled requests never call the model or CRM tools", async () => {
  const controller = new AbortController(); controller.abort();
  assert.equal((await run({ signal: controller.signal })).at(-1).status, "error");
  assert.equal(state.calls.length, 0); assert.equal(state.toolCalls.length, 0);
});
