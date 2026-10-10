import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { load, moduleUrl } from "./load.mjs";
let state;
beforeEach(() => { state = { calls: [], specialistCalls: [], toolCalls: [], memberQueries: [], rows: [], history: [], mode: "chain", member: { role: "owner" }, userSaveError: false, assistantSaveError: false }; });
globalThis.__agentDb = () => ({ async rpc(name, args) {
  state.messageRpc ??= []; state.messageRpc.push({ name, args });
  if (state.messageDenied && name === "reserve_nexo_message") return { data: { ok: false, balance: { plan: "trial", businessName: "A", quotaMessages: 15, usedMessages: 15, reservedMessages: 0, availableMessages: 0, windowHours: 3, resetsAt: "2026-10-10T20:00:00Z", fullyResetsAt: "2026-10-10T21:00:00Z" } }, error: null };
  return { data: { ok: true }, error: null };
}, from(table) {
  let inserted;
  const filters = {};
  const query = {
    insert(row) { inserted = row; state.rows.push(row); return query; },
    select() { return query; }, eq(key, value) { filters[key] = value; return query; }, order() { return query; }, limit() { return query; }, abortSignal() { return query; },
    maybeSingle: async () => {
      if (table === "tenant_members") {
        state.memberQueries.push({ ...filters });
        if (state.membershipThrow) throw new Error("private-membership-response");
        return { data: state.member, error: state.membershipError ? { message: "private-membership-error" } : null };
      }
      return { data: null, error: null };
    },
    single: async () => ({ data: { id: "saved" }, error: state.assistantSaveError ? { message: "private" } : null }),
    then(resolve, reject) { return Promise.resolve({ data: inserted ? null : table === "jarvis_messages" ? structuredClone(state.history) : [], error: inserted?.role === "user" && state.userSaveError ? { message: "private" } : null }).then(resolve, reject); },
  }; return query;
} });
const toolCall = (name, args = {}) => ({ id: `call-${state.calls.length}`, function: { name, arguments: typeof args === "string" ? args : JSON.stringify(args) } });
globalThis.__agentStream = async function* (account, messages, tools, options) {
  state.calls.push({ account, messages: structuredClone(messages), tools, options });
  if (state.providerError) throw state.providerError;
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
  } else if (["navigate", "repeat"].includes(state.mode) && state.calls.length === 1) {
    yield { type: "tool_calls", toolCalls: [state.mode === "navigate" ? toolCall("open_crm_panel", { panel: "orders" })
      : toolCall("delegate_to_agent", { agent: "pedidos", task: "Prepara otro pedido para el cliente confirmado" })] };
  } else if (state.mode === "provider-error") {
    throw new Error("private-provider-body");
  } else yield { type: "delta", content: "Ana tiene un pedido pendiente." };
  yield { type: "done", model: "test-model", tokensIn: 20, tokensOut: 10 };
};
globalThis.__agentTool = async (name, args, context) => {
  state.toolCalls.push({ name, args, context });
  return { ok: true, data: name === "search_customers" ? { customers: [{ id: "customer-a", name: "Ana" }] } : { orders: [{ id: "order-a", status: "pending_payment" }] } };
};
globalThis.__agentPromptTools = () => state.measurePrompt
  ? ["search_customers", "get_customer_history", "list_conversations", "get_conversation", "list_handoffs", "list_orders", "get_order_details", "search_catalog", "check_stock", "get_business_overview"]
  : ["search_customers", "list_orders"];
const webTools = moduleUrl("export const webCrmTools=(tenant,role)=>tenant&&role?globalThis.__agentPromptTools().map(name=>({type:'function',function:{name}})):[]; export const executeWebToolCall=(...args)=>globalThis.__agentTool(...args);");
globalThis.__agentPrepare = async () => {
  state.toolCalls.push({ name: "prepare_repeat_order_proposal" });
  const proposal = { id: "proposal-a" };
  state.proposals.push(proposal);
  return { ok: true, data: { proposal, requires_click_confirmation: true, order_created: false, stock_reserved: false } };
};
globalThis.__agentPreparation = () => {
  state.proposals = [];
  return { tools: (state.measurePrompt ? ["prepare_order_proposal", "prepare_repeat_order_proposal"] : state.mode === "repeat" ? ["prepare_repeat_order_proposal"] : []).map(name => ({ type: "function", function: { name } })), proposals: state.proposals,
    execute: async () => ({ ok: false }), executeRepeat: globalThis.__agentPrepare };
};
globalThis.__specialistComplete = async (account, messages, tools, options) => {
  state.specialistCalls.push({ account, messages: structuredClone(messages), tools, options });
  const evidence = messages.filter(message => message.role === "tool");
  const selected = state.mode === "repeat" ? tools?.find(tool => tool.function.name === "prepare_repeat_order_proposal") : tools?.[0];
  return { content: evidence.length ? "Consulta confirmada." : null,
    toolCalls: evidence.length || !selected ? [] : [{ ...toolCall(selected.function.name,
      selected.function.name === "search_customers" ? { query: "Ana" } : { customer_id: "customer-a" }), type: "function" }],
    model: "test-model", tokensIn: 15, tokensOut: 5, latencyMs: 1 };
};
const team = await load("../../lib/agent/team.ts", { zod: import.meta.resolve("zod") });
const operator = await load("../../lib/crm-operator.ts");
const activity = await load("../../lib/agent/operator-activity.ts", { "@/lib/crm-operator": operator });
const navigation = await load("../../lib/agent/navigation.ts", { zod: import.meta.resolve("zod"), "@/lib/jarvis-commands": await load("../../lib/jarvis-commands.ts") });
const credits = await load("../../lib/credits/server.ts", { "@/lib/supabase/admin": moduleUrl("export const createAdminClient=()=>globalThis.__agentDb();") });
const { CreditError, inputReservation } = await import(credits);
const { createAgentExecutor } = await import(await load("../../lib/agent/executor.ts", {
  "@/lib/supabase/admin": moduleUrl("export const createAdminClient=()=>globalThis.__agentDb();"),
  "@/lib/llm": moduleUrl("export const calculateCost=()=>0; export const configuredModel=()=> 'test-model';"),
  "@/lib/llm/metered": moduleUrl("export const meteredChatCompletionStream=(...args)=>globalThis.__agentStream(...args); export const meteredChatCompletion=(...args)=>globalThis.__specialistComplete(...args);"),
  "./web-tools": webTools,
  "./work-tools": await load("../../lib/agent/work-tools.ts", { zod: import.meta.resolve("zod"), "@/lib/workspace": await load("../../lib/workspace.ts", { zod: import.meta.resolve("zod") }) }),
  "./team": team,
  "./order-actions": moduleUrl("export const createOrderPreparation=()=>globalThis.__agentPreparation();"),
  "./navigation": navigation,
  "./operator-activity": activity,
  "@/lib/crm-operator": operator,
  "@/lib/credits/server": credits,
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

test("each CRM step rechecks the authenticated user and tenant; revoked or changed roles cannot execute", async () => {
  await run();
  assert.deepEqual(state.memberQueries, [
    { tenant_id: "business-a", user_id: "auth-user-a" },
    { tenant_id: "business-a", user_id: "auth-user-a" },
  ]);
  for (const change of [{ member: null }, { member: { role: "viewer" } }, { membershipError: true }, { membershipThrow: true }]) {
    state.calls = []; state.specialistCalls = []; state.toolCalls = []; state.memberQueries = [];
    state.member = { role: "owner" }; state.membershipError = false; state.membershipThrow = false;
    Object.assign(state, change);
    const events = await run();
    assert.equal(state.toolCalls.length, 0);
    assert.equal(events.at(-1).operatorActions.length, 2);
    assert.ok(events.at(-1).operatorActions.every(action => action.status === "failed"));
    assert.doesNotMatch(JSON.stringify(events), /private-membership/);
  }
});

test("navigation emits running and verified completion without claiming the screen has already opened", async () => {
  state.mode = "navigate";
  const events = await run({ role: "viewer" });
  // The role must match the authenticated membership, even for read-only navigation.
  assert.equal(events.at(-1).operatorActions[0].status, "failed");
  state.member = { role: "viewer" }; state.calls = [];
  const allowed = await run({ role: "viewer" });
  const progress = allowed.filter(event => event.operation).map(event => event.operation);
  assert.deepEqual(progress.map(action => action.status), ["running", "completed"]);
  assert.equal(progress[0].navigation, undefined);
  assert.equal(progress[1].navigation.href, "/dashboard/orders");
  const toolResult = JSON.parse(state.calls[1].messages.find(message => message.role === "tool").content);
  assert.equal(toolResult.data.opened, false);
  assert.equal(toolResult.data.destination_verified, true);
  assert.deepEqual(allowed.at(-1).operatorActions, [progress[1]]);
  assert.deepEqual(state.rows.at(-1).metadata.operatorActions, [progress[1]]);
});

test("repeat preparation remains a pending approval and retains its proposal if final persistence fails", async () => {
  state.mode = "repeat";
  const events = await run();
  assert.deepEqual(events.at(-1).operatorActions.map(action => [action.tool, action.status]), [["prepare_repeat_order_proposal", "approval_required"]]);
  assert.deepEqual(events.at(-1).orderProposals, [{ id: "proposal-a" }]);
  assert.equal(state.toolCalls.length, 1);
  assert.equal(state.rows.at(-1).metadata.handoffs[0].status, "completed");
  state.calls = []; state.specialistCalls = []; state.assistantSaveError = true;
  const failed = await run();
  assert.equal(failed.at(-1).status, "error");
  assert.deepEqual(failed.at(-1).orderProposals, [{ id: "proposal-a" }]);
  assert.equal(failed.at(-1).operatorActions[0].status, "approval_required");
  assert.deepEqual(state.rows.at(-1).metadata.orderProposals, [{ id: "proposal-a" }]);
});

test("unexpected provider exceptions do not reach SSE, stored messages, or operator metadata", async () => {
  state.mode = "provider-error";
  const events = await run();
  assert.equal(events.at(-1).status, "error");
  assert.doesNotMatch(JSON.stringify(events) + JSON.stringify(state.rows), /private-provider-body/);
  assert.match(events.at(-1).error, /resultados confirmados/);
});

test("default coordinator context stays bounded with every CRM specialist and preserves complete conversation history", async () => {
  state.mode = "text"; state.measurePrompt = true;
  for (const spokenResponse of [false, true]) {
    state.calls = [];
    await run({ spokenResponse });
    const first = state.calls[0];
    assert.equal(first.messages.length, 2);
    assert.deepEqual(first.tools.find(tool => tool.function.name === "delegate_to_agent").function.parameters.properties.agent.enum,
      ["clientes", "pedidos", "catalogo", "analisis", "seguimiento"]);
    assert.ok(inputReservation(first.messages, first.tools) < (spokenResponse ? 7000 : 6500), `Coordinator plus follow-up specialist must remain bounded (${inputReservation(first.messages, first.tools)})`);
  }
  state.history = [{ role: "assistant", content: "Conservo el resultado anterior" }, { role: "user", content: "Conservo la pregunta anterior" }];
  state.calls = [];
  await run();
  assert.equal(state.calls[0].messages.length, 4);
  assert.ok(state.calls[0].messages.some(message => message.content === "Conservo el resultado anterior"));
  assert.ok(state.calls[0].messages.some(message => message.content === "Conservo la pregunta anterior"));
});

test("insufficient credits explains the capacity required by the turn without claiming the whole plan is empty", async () => {
  state.providerError = new CreditError("CREDITS_EXHAUSTED", "private-provider-credit-details");
  const events = await run();
  assert.equal(events.at(-1).status, "error");
  assert.match(events.at(-1).error, /créditos restantes.*turno.*contexto/);
  assert.match(events.at(-1).error, /conversación nueva/);
  assert.doesNotMatch(JSON.stringify(events), /private-provider-credit|OpenAI|tokens/);
});

test("one user turn reserves and completes exactly one message across all specialists",async()=>{
  await run();
  assert.equal(state.messageRpc.filter(call=>call.name==='reserve_nexo_message').length,1);
  const finished=state.messageRpc.filter(call=>call.name==='finish_nexo_message');
  assert.equal(finished.length,1);assert.equal(finished[0].args.p_completed,true);
  assert.ok([...state.calls,...state.specialistCalls].every(call=>call.account.messageReservationId===finished[0].args.p_id));
});
test("message exhaustion gives recovery time and prevents all model/tool calls",async()=>{
  state.messageDenied=true;const events=await run();
  assert.equal(events.at(-1).status,'error');assert.match(events.at(-1).error,/Recuperas espacio.*Colombia/);
  assert.match(events.at(-1).error,/abrir otra conversación no cambia/);
  assert.equal(state.calls.length,0);assert.equal(state.toolCalls.length,0);
});
test("failed and disconnected turns release their message; preference-only saves use no quota",async()=>{
  state.mode='provider-error';await run();
  assert.equal(state.messageRpc.at(-1).args.p_completed,false);
  state.messageRpc=[];await run({memoryReply:'Preferencia guardada'});assert.equal(state.messageRpc.length,0);
  state.mode='text';state.messageRpc=[];
  const stream=createAgentExecutor({sessionId:'session-a',userId:'auth-user-a',tenantId:'business-a',role:'owner',userMessage:'Hola'});
  for await(const event of stream){if(event.status==='streaming')break;}
  assert.equal(state.messageRpc.at(-1).args.p_completed,false);
});
test("failed history pairs are excluded and large history is bounded without inventing missing context",async()=>{
  state.mode='text';
  state.history=[{role:'assistant',status:'error',content:'Error repetido'},{role:'user',status:'completed',content:'Intento fallido'},
    {role:'assistant',status:'completed',content:'Respuesta útil'},{role:'user',status:'completed',content:'Pregunta útil'},
    {role:'assistant',status:'completed',content:'x'.repeat(20000)},{role:'user',status:'completed',content:'Historia antigua'}];
  await run();const messages=state.calls[0].messages;
  assert.ok(messages.some(row=>row.content==='Respuesta útil'));
  assert.ok(messages.some(row=>row.content.includes('historial antiguo se omitió')));
  assert.ok(!messages.some(row=>/Error repetido|Intento fallido|Historia antigua/.test(row.content)));
});
