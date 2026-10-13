import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { readFile } from "node:fs/promises";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { moduleUrl } from "../agent/load.mjs";

const tenantId = crypto.randomUUID();
const conversationId = crypto.randomUUID();
const orderId = crypto.randomUUID();
let state;
beforeEach(() => { state = { runs: [], followups: [], errors: {}, queries: [] }; });
globalThis.__salesActivityClient = {
  from(table) {
    const call = { table, filters: [], fields: "" };
    state.queries.push(call);
    const q = { select(fields) { call.fields = fields; return q; }, eq(...filter) { call.filters.push(filter); return q; }, order() { return q; }, limit(value) { call.limit = value; return q; },
      then(resolve) { return Promise.resolve({ data: table === "agent_runs" ? state.runs : state.followups, error: state.errors[table] ?? null }).then(resolve); } };
    return q;
  },
};
let source = await readFile(new URL("../../app/dashboard/agent/sales-activity.tsx", import.meta.url), "utf8");
const replacements = {
  "next/link": moduleUrl(`import {createElement} from ${JSON.stringify(import.meta.resolve("react"))};export default function Link({children,...props}){return createElement('a',props,children);}`),
  "lucide-react": moduleUrl("export const Activity=()=>null;export const ArrowUpRight=()=>null;export const Clock3=()=>null;export const ShieldCheck=()=>null;"),
  "@/lib/supabase/server": moduleUrl("export const createClient=async()=>globalThis.__salesActivityClient;"),
  "@/components/ui/badge": moduleUrl(`import {createElement} from ${JSON.stringify(import.meta.resolve("react"))};export const Badge=({children})=>createElement('span',null,children);`),
  "./sales-followups-form": moduleUrl(`import {createElement} from ${JSON.stringify(import.meta.resolve("react"))};export const CancelFollowupButton=({id})=>createElement('button',{'data-followup':id},'Cancelar recordatorio');`),
};
for (const [from, to] of Object.entries(replacements)) source = source.replaceAll(JSON.stringify(from), JSON.stringify(to));
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX } }).outputText.replaceAll('"react/jsx-runtime"', JSON.stringify(import.meta.resolve("react/jsx-runtime")));
const { SalesActivity } = await import(moduleUrl(compiled));
const render = async (role = "owner", conversation = conversationId) => renderToStaticMarkup(await SalesActivity({ tenantId, role, conversationId: conversation }));

test("sales activity scopes both queries and renders safe summaries instead of raw arguments or provider errors", async () => {
  state.runs = [{ id: crypto.randomUUID(), conversation_id: conversationId, status: "sent", tool_calls: [{ name: "confirm_order", args: { token: "private-argument" }, result: { ok: true, error: "private-provider" } }, { name: "constructor", args: { raw: "private-argument" }, result: { ok: false } }], created_at: "2026-10-11T15:00:00Z" }];
  state.followups = [{ id: crypto.randomUUID(), conversation_id: conversationId, order_id: orderId, reminder_no: 1, status: "unknown", reason: "private-provider", updated_at: "2026-10-11T16:00:00Z", due_at: "2026-10-11T16:00:00Z" }];
  const html = await render();
  for (const query of state.queries) {
    assert.deepEqual(query.filters, [["tenant_id", tenantId], ["conversation_id", conversationId]]);
    assert.equal(query.limit, 25);
    assert.doesNotMatch(query.fields, /proposed_reply|final_reply|error/);
  }
  assert.match(html, /Confirmó el pedido/);
  assert.match(html, /Envío sin confirmar/);
  assert.match(html, /No se reenvía automáticamente/);
  assert.match(html, new RegExp(`/dashboard/orders/${orderId}`));
  assert.doesNotMatch(html, /private-argument|private-provider|Cancelar recordatorio/);
});

test("only owners and agents see cancellation for queued or claimed followups", async () => {
  state.followups = [{ id: crypto.randomUUID(), conversation_id: conversationId, order_id: orderId, reminder_no: 1, status: "queued", reason: null, updated_at: "2026-10-11T16:00:00Z", due_at: "2026-10-11T17:00:00Z" }];
  assert.match(await render("owner"), /Cancelar recordatorio/);
  assert.match(await render("agent"), /Cancelar recordatorio/);
  assert.doesNotMatch(await render("viewer"), /Cancelar recordatorio/);
  state.followups[0].status = "sent";
  assert.doesNotMatch(await render("owner"), /Cancelar recordatorio/);
  assert.match(await render("owner"), /Esto no confirma que el cliente haya pagado/);
});

test("query failures show an explicit incomplete state and never masquerade as an empty history", async () => {
  state.errors.agent_runs = { message: "private database detail" };
  const html = await render();
  assert.match(html, /No se pudo cargar la actividad de respuestas/);
  assert.match(html, /lista puede estar incompleta/);
  assert.doesNotMatch(html, /Todavía no hay acciones|private database detail/);
  state.errors = {};
  assert.match(await render(), /Todavía no hay acciones/);
});
