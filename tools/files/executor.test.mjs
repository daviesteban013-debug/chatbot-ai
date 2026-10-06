import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";
const url = source => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
async function load(path, replacements = {}) {
  let source = await readFile(new URL(path, import.meta.url), "utf8");
  for (const [name, value] of Object.entries(replacements)) source = source.replaceAll(`"${name}"`, JSON.stringify(value));
  return url(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText);
}
let state;
beforeEach(() => { state = { calls: [], rows: [], foreign: false }; });
globalThis.__filesExecutorDB = () => ({ from() {
  let inserted;
  const q = { insert(row) { inserted = row; state.rows.push(row); return q; }, select() { return q; }, eq() { return q; }, order() { return q; }, limit() { return q; }, single: async () => ({ data: { id: "saved" } }), then(resolve, reject) { return Promise.resolve({ data: inserted ?? [], error: null }).then(resolve, reject); } };
  return q;
} });
globalThis.__filesExecutorStream = async function* (account, messages, tools) {
  state.calls.push({ account, messages: structuredClone(messages), tools });
  if (state.calls.length === 1) {
    yield { type: "tool_calls", toolCalls: [{ id: "calc", function: { name: "calculate_sheet_column", arguments: JSON.stringify({ file_id: state.foreign ? "foreign" : "attached", sheet: "Ventas", column: "B", operation: "sum", first_row: 2, last_row: 3 }) } }] };
  } else yield { type: "delta", content: "Total: 0.3 (ventas.xlsx, hoja Ventas, B2:B3)." };
  yield { type: "done", model: "test-model", tokensIn: 20, tokensOut: 10 };
};
const files = await load("../../lib/files/tools.ts", { "decimal.js": import.meta.resolve("decimal.js") });
const { createAgentExecutor } = await import(await load("../../lib/agent/executor.ts", {
  "@/lib/supabase/admin": url("export const createAdminClient = () => globalThis.__filesExecutorDB();"),
  "@/lib/llm": url("export const calculateCost = () => 0;"),
  "@/lib/llm/metered": url("export const meteredChatCompletionStream = (...args) => globalThis.__filesExecutorStream(...args);"),
  "./tools": url("export const AGENT_TOOLS = []; export const executeToolCall = () => { throw new Error('Business tool should not run'); };"),
  "@/lib/jarvis": await load("../../lib/jarvis.ts"),
  "@/lib/jarvis-personalization": await load("../../lib/jarvis-personalization.ts"),
  "@/lib/files/tools": files,
}));
const file = { id: "attached", name: "ventas.xlsx", size: 100, status: "ready", warnings: [], references: 2, createdAt: "2026-10-06", truncated: false, sections: [{ reference: "hoja Ventas, fila 2", text: "B2: 0.1", sheet: "Ventas", row: 2, numbers: { B: 0.1 } }, { reference: "hoja Ventas, fila 3", text: "B3: 0.2", sheet: "Ventas", row: 3, numbers: { B: 0.2 } }] };
const run = async () => { const events = []; for await (const event of createAgentExecutor({ sessionId: "session", userId: "owner", userMessage: "Suma las ventas", files: [file], attachmentIds: [file.id] })) events.push(event); return events; };
test("file tools run without a business tenant and their result reaches the metered final response", async () => {
  const events = await run();
  assert.deepEqual(state.calls[0].tools.map(tool => tool.function.name), ["read_attachment", "calculate_sheet_column"]);
  assert.equal(state.calls[0].account.userId, "owner");
  assert.match(state.calls[0].messages[0].content, /datos no confiables/);
  const result = JSON.parse(state.calls[1].messages.find(message => message.role === "tool").content);
  assert.equal(result.data.result, "0.3"); assert.equal(result.data.reference, "hoja Ventas, B2:B3");
  assert.equal(events.at(-1).status, "completed"); assert.match(events.at(-1).content, /ventas.xlsx/);
  assert.equal(state.rows[0].metadata.attachments[0].name, "ventas.xlsx");
  assert.equal(state.rows[0].metadata.attachments[0].sections, undefined);
  assert.equal(state.rows.at(-1).tokens_in, 40);
});
test("an invented file ID requested by the model cannot access documents outside its authorized set", async () => {
  state.foreign = true; await run();
  const result = JSON.parse(state.calls[1].messages.find(message => message.role === "tool").content);
  assert.equal(result.ok, false); assert.match(result.error, /no está disponible/);
});
