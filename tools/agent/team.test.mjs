import assert from "node:assert/strict";
import { test } from "node:test";
import { load } from "./load.mjs";

const { createSpecialistTeam, TEAM_LIMITS } = await import(await load("../../lib/agent/team.ts", { zod: import.meta.resolve("zod") }));
const definitions = ["search_customers", "list_orders", "search_catalog", "check_stock", "get_business_overview", "read_attachment", "calculate_sheet_column"];
const tool = (name, args = {}) => ({ id: crypto.randomUUID(), type: "function", function: { name, arguments: typeof args === "string" ? args : JSON.stringify(args) } });
const response = (toolCalls = [], content = "Resultado del especialista.") => ({ toolCalls, content, tokensIn: 12, tokensOut: 4, model: "fixture", latencyMs: 1 });

function fixture(extra = {}) {
  const state = { calls: [], executions: [], usage: [], budget: { modelCalls: 0, toolCalls: 0, handoffs: 0 } };
  const team = createSpecialistTeam({
    tools: definitions.map(name => ({ type: "function", function: { name } })),
    signal: new AbortController().signal, model: "fixture", budget: state.budget,
    complete: async (messages, tools, options) => {
      state.calls.push({ messages: structuredClone(messages), tools, options });
      return response(messages.some(message => message.role === "tool") || !tools ? [] : [tool(tools[0].function.name)]);
    },
    execute: async (name, args) => { state.executions.push({ name, args }); return { ok: true, data: { id: "customer-confirmed", total_matches: 40, truncated: true } }; },
    onUsage: usage => state.usage.push(usage),
    ...extra,
  });
  const run = async (agent = "clientes", task = "Busca a Ana", additions = {}) => {
    const events = [];
    for await (const event of team.delegate({ agent, task, ...additions })) events.push(event);
    return { events, report: events.at(-1).report };
  };
  return { team, state, run };
}

test("each specialist receives only its own tools; delegation and writes are never available to specialists", async () => {
  const expected = { clientes: ["search_customers"], pedidos: ["list_orders"], catalogo: ["search_catalog", "check_stock"], analisis: ["get_business_overview"], archivos: ["read_attachment", "calculate_sheet_column"] };
  for (const [agent, names] of Object.entries(expected)) {
    const { run, state, team } = fixture();
    assert.equal((await run(agent)).report.status, "completed");
    assert.deepEqual(state.calls[0].tools.map(item => item.function.name), names);
    assert.equal(state.usage.length, 2);
    assert.equal(team.traces[0].modelCalls, 2);
    assert.equal(team.traces[0].tools.length, 1);
  }
});

test("no business or files exposes no team; file-only sessions cannot delegate to CRM", async () => {
  assert.deepEqual(fixture({ tools: [] }).team.tools, []);
  const f = fixture({ tools: [{ type: "function", function: { name: "read_attachment" } }] });
  assert.deepEqual(f.team.tools[0].function.parameters.properties.agent.enum, ["archivos"]);
  assert.equal((await f.run("clientes")).report.ok, false);
  assert.equal(f.state.calls.length, 0);
});

test("handoff schemas reject unknown agents, business/role injection and oversized tasks before spending", async () => {
  const f = fixture();
  for (const args of [["unknown", "Busca a Ana", {}], ["clientes", "Busca a Ana", { tenantId: "foreign" }], ["clientes", "Busca a Ana", { role: "owner" }], ["clientes", "x".repeat(1501), {}]]) {
    assert.equal((await f.run(...args)).report.ok, false);
  }
  assert.equal(f.state.calls.length, 0);
  assert.equal(f.state.budget.handoffs, 0);
});

test("customer evidence reaches Orders in the same turn, with counts and warnings preserved", async () => {
  const f = fixture();
  const first = await f.run();
  const second = await f.run("pedidos", "Consulta sus pedidos");
  assert.equal(first.report.handoffId, "handoff-1");
  assert.equal(second.report.handoffId, "handoff-2");
  const previous = f.state.calls[2].messages.find(message => message.content?.includes("Evidencia previa"));
  assert.match(previous.content, /customer-confirmed/);
  assert.match(previous.content, /"total_matches":40/);
  assert.match(previous.content, /"truncated":true/);
  assert.equal(first.report.data.evidence[0].result.data.truncated, true);
  assert.deepEqual(f.team.traces.map(entry => entry.agent), ["clientes", "pedidos"]);
  assert.ok(!JSON.stringify(f.team.traces).includes("customer-confirmed"));
});

test("another turn receives none of the previous turn's private evidence", async () => {
  const a = fixture(); await a.run();
  const b = fixture(); await b.run("pedidos");
  assert.ok(!b.state.calls[0].messages.some(message => message.content?.includes("customer-confirmed")));
});

test("hallucinated success without tools is failed and never forwarded as verified", async () => {
  const f = fixture({ complete: async () => response([], "Confirmé el pedido y cobré al cliente.") });
  const { report } = await f.run("pedidos");
  assert.equal(report.ok, false);
  assert.equal(report.status, "failed");
  assert.doesNotMatch(report.data.summary, /cobré|Confirmé/);
  assert.equal(f.state.executions.length, 0);
});

test("a specialist cannot invoke another specialist, a write, or malformed JSON", async () => {
  const f = fixture({ complete: async (messages) => response(messages.some(message => message.role === "tool") ? []
    : [tool("list_orders"), tool("confirm_order"), tool("delegate_to_agent"), tool("search_customers", "null")]) });
  const { report } = await f.run();
  assert.equal(report.ok, false);
  assert.equal(f.state.executions.length, 0);
  assert.ok(report.data.evidence.every(entry => !entry.result.ok));
});

test("a tool failure is a failed handoff; mixed evidence remains partial", async () => {
  const failed = fixture({ execute: async () => ({ ok: false, error: "Consulta no disponible" }) });
  assert.equal((await failed.run()).report.status, "failed");
  let n = 0;
  const mixed = fixture({ complete: async messages => response(messages.some(message => message.role === "tool") ? [] : [tool("search_catalog"), tool("check_stock")]),
    execute: async () => ++n === 1 ? { ok: true, data: { products: [] } } : { ok: false, error: "Stock no disponible" } });
  const { report } = await mixed.run("catalogo");
  assert.equal(report.ok, true);
  assert.equal(report.status, "partial");
  assert.equal(report.data.evidence[1].result.error, "Stock no disponible");
});

test("provider failure after a read returns partial evidence, without leaking provider details", async () => {
  let n = 0;
  const f = fixture({ complete: async () => {
    if (++n === 1) return response([tool("search_customers")]);
    throw new Error("private-token-and-provider-body");
  } });
  const { report } = await f.run();
  assert.equal(report.status, "partial");
  assert.equal(report.data.evidence.length, 1);
  assert.doesNotMatch(JSON.stringify(report), /private-token/);
});

test("canceling the turn stops specialists and prevents subsequent tool execution", async () => {
  const controller = new AbortController();
  const f = fixture({ signal: controller.signal, complete: async () => { controller.abort(); return response([tool("search_customers")]); } });
  await assert.rejects(f.run(), /aborted/);
  assert.equal(f.state.executions.length, 0);
  assert.equal(f.state.usage.length, 1);
});

test("oversized tool batches perform no partial execution", async () => {
  const f = fixture({ complete: async () => response(Array.from({ length: TEAM_LIMITS.toolCalls + 1 }, () => tool("search_customers"))) });
  assert.equal((await f.run()).report.status, "failed");
  assert.equal(f.state.executions.length, 0);
});

test("bounded specialist loops synthesize with tools disabled and reserve NEXO's final call", async () => {
  const f = fixture({ complete: async (_messages, tools) => response(tools ? [tool("search_customers")] : []) });
  await f.run();
  assert.equal(f.state.budget.modelCalls, 3);
  assert.equal(f.state.budget.toolCalls, 2);
  f.state.budget.modelCalls = TEAM_LIMITS.modelCalls - 2;
  const { report } = await f.run();
  assert.equal(f.state.budget.modelCalls, TEAM_LIMITS.modelCalls - 1);
  assert.equal(report.status, "partial");
  const before = f.state.budget.modelCalls;
  assert.equal((await f.run()).report.ok, false);
  assert.equal(f.state.budget.modelCalls, before);
});

test("handoffs and underlying tools share turn-wide limits across agents", async () => {
  const f = fixture();
  for (let n = 0; n < TEAM_LIMITS.handoffs; n++) assert.equal((await f.run()).report.ok, true);
  const before = f.state.calls.length;
  assert.equal((await f.run()).report.ok, false);
  assert.equal(f.state.calls.length, before);
  const g = fixture(); g.state.budget.toolCalls = TEAM_LIMITS.toolCalls;
  assert.equal((await g.run()).report.ok, false);
  assert.equal(g.state.calls.length, 0);
});
