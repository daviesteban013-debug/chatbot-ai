import assert from "node:assert/strict";
import nextEnv from "@next/env";
import { moduleUrl } from "../stripe/load-module.mjs";

// Real model + real credit metering; synthetic CRM and in-memory conversation only.
// No business records are read, changed or sent to the provider. Never print credentials.
nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const inline = source => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const rows = [], queries = [];
const customerId = "11111111-1111-4111-8111-111111111111";
globalThis.__teamSmokeDB = () => ({ from(table) {
  let inserted;
  const q = {
    insert(row) { inserted = row; rows.push(row); return q; },
    select() { return q; }, eq() { return q; }, order() { return q; }, limit() { return q; }, abortSignal() { return q; },
    maybeSingle: async () => ({ data: null, error: null }),
    single: async () => ({ data: { id: "synthetic-message" }, error: null }),
    then(resolve, reject) { return Promise.resolve({ data: inserted ? null : table === "jarvis_messages" ? [] : null, error: null }).then(resolve, reject); },
  };
  return q;
} });
globalThis.__teamSmokeQuery = async (name, args, context) => {
  assert.equal(context.tenantId, "");
  assert.equal(context.role, "owner");
  queries.push(name);
  if (name === "search_customers") return { ok: true, data: { customers: [{ id: customerId, name: "Aurora de prueba" }], total_matches: 1, truncated: false } };
  if (name === "list_orders") {
    assert.equal(args.customer_id, customerId, "Orders must use the customer ID obtained by the first agent");
    return { ok: true, data: { orders: [{ id: "synthetic-order", status: "pending_payment", total: 120000 }], total_matches: 1, truncated: false, currency: "COP" } };
  }
  throw new Error("Unexpected tool");
};
let stage = "load_modules";
try {
  const { createAgentExecutor } = await import(await moduleUrl("lib/agent/executor.ts", {
    "@/lib/supabase/admin": inline("export const createAdminClient=()=>globalThis.__teamSmokeDB();"),
    "@/lib/llm": await moduleUrl("lib/llm/client.ts"),
    "./web-tools": inline(`export const webCrmTools=()=>[
      {type:'function',function:{name:'search_customers',description:'Busca clientes por nombre y devuelve su ID real.',parameters:{type:'object',properties:{query:{type:'string'}},required:['query'],additionalProperties:false}}},
      {type:'function',function:{name:'list_orders',description:'Consulta pedidos de un cliente por su ID real.',parameters:{type:'object',properties:{customer_id:{type:'string'},status:{type:'string'}},required:['customer_id'],additionalProperties:false}}}
    ];export const executeWebToolCall=(...args)=>globalThis.__teamSmokeQuery(...args);`),
    // The turn uses the bounded shared demo credit pool, never a customer's plan.
    "@/lib/credits/server": await moduleUrl("lib/credits/server.ts"),
  }));
  const events = [];
  stage = "execute_turn";
  for await (const event of createAgentExecutor({
    sessionId: "synthetic-team-smoke", tenantId: null, userId: null,
    role: "owner", userMessage: "Busca al cliente de prueba Aurora y consulta sus pedidos pendientes. Informa el estado y si hay más coincidencias.",
  })) events.push(event);
  stage = "validate_result";
  assert.equal(events.at(-1)?.status, "completed", "The model must finish the coordinated turn");
  assert.deepEqual(queries, ["search_customers", "list_orders"]);
  assert.deepEqual(events.at(-1).handoffs.map(handoff => handoff.agent), ["clientes", "pedidos"]);
  assert.ok(events.at(-1).handoffs.every(handoff => handoff.status === "completed"));
  assert.match(events.at(-1).content, /pendiente|pago/i);
  const saved = rows.at(-1);
  console.log(JSON.stringify({ ok: true, syntheticDataOnly: true, agents: saved.metadata.handoffs.map(handoff => handoff.agent), modelCalls: saved.metadata.modelCalls, tokensIn: saved.tokens_in, tokensOut: saved.tokens_out, latencyMs: saved.latency_ms }));
} catch (error) {
  console.error(JSON.stringify({ ok: false, stage, code: typeof error.code === "string" && /^(ERR_[A-Z_]+|ENOENT|ENAMETOOLONG)$/.test(error.code) ? error.code : "CHECK_FAILED", missingModule: error.code === "ENOENT" ? String(error.path).split(/[\\/]/).at(-1) : undefined, reason: "La comprobación del equipo no se completó. Revisa acceso, cuota, latencia y pruebas locales." }));
  process.exitCode = 1;
} finally {
  delete globalThis.__teamSmokeDB;
  delete globalThis.__teamSmokeQuery;
}
