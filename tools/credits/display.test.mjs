import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
async function load(file, replacements = {}) {
  let source = await readFile(new URL(file, import.meta.url), "utf8");
  for (const [from, to] of Object.entries(replacements)) source = source.replaceAll(JSON.stringify(from), JSON.stringify(to));
  return moduleUrl(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX } }).outputText.replaceAll('"react/jsx-runtime"', JSON.stringify(import.meta.resolve("react/jsx-runtime"))));
}
const credits = await load("../../lib/credits.ts");
const { CreditBalancePanel } = await import(await load("../../components/dashboard/credit-balance.tsx", {
  "@/lib/credits": credits,
  "react": moduleUrl("export const useState=initial=>[initial===null?globalThis.__creditDisplay:initial,()=>{}]; export const useEffect=()=>{};"),
}));
const base = { plan: "crecimiento", businessName: "inge", quotaMessages: 100, availableMessages: 65, usedMessages: 25, reservedMessages: 10, windowHours: 3, resetsAt: "2026-11-01T05:00:00Z" };
function render(balance = base, props = {}) { globalThis.__creditDisplay = balance; return renderToStaticMarkup(createElement(CreditBalancePanel, props)); }

test("credit UI shows available capacity after reservations in every layout, without exposing token counts", () => {
  for (const props of [{}, { compact: true }, { theme: "dark" }]) {
    const html = render(base, props);
    assert.match(html, /role="progressbar"/);
    assert.match(html, /aria-valuenow="65"/);
    assert.match(html, /width:65%/);
    assert.match(html, /65 %/);
    assert.match(html, /Parte del cupo está en uso/);
    assert.doesNotMatch(html, /\btokens\b|650|250|1000/);
    assert.match(html, /inge.*100 mensajes \/ 3 horas/);
    assert.match(html, /65 mensajes disponibles/);
  }
});

test("exhaustion, low capacity and rounding cannot display a full or empty allowance incorrectly", () => {
  const exhausted = render({ ...base, availableMessages: 0 });
  assert.match(exhausted, /aria-valuenow="0"/); assert.match(exhausted, /Sin mensajes disponibles/);
  const fractional = render({ ...base, quotaMessages: 1000, availableMessages: 1 });
  assert.match(fractional, /&lt;1 %/); assert.match(fractional, /10 % o menos/);
  const almostFull = render({ ...base, availableMessages: 99 });
  assert.match(almostFull, /99 %/); assert.doesNotMatch(almostFull, />100 %</);
  assert.match(render({ ...base, quotaMessages: 0, availableMessages: 0 }), /aria-valuenow="0"/);
  assert.match(render({ ...base, availableMessages: -50 }), /aria-valuenow="0"/);
  assert.match(render({ ...base, availableMessages: 1100 }), /aria-valuenow="100"/);
});

test("unavailable balances remain unavailable rather than showing a fabricated empty quota", () => {
  const html = render(null);
  assert.match(html, /Consultando mensajes/);
  assert.doesNotMatch(html, /progressbar|0 %/);
});
test("full allowance has no invented renewal date; trial and separate WhatsApp remain explicit",()=>{
  const html=render({...base,plan:'trial',availableMessages:100,resetsAt:null,reservedMessages:0,whatsappBalance:{quotaTokens:20000,availableTokens:10000}});
  assert.match(html,/Todo el cupo disponible/);assert.doesNotMatch(html,/Invalid Date|1970/);
  assert.match(html,/otro negocio no se comparte/);assert.match(html,/WhatsApp · cupo mensual separado/);
  assert.match(render({...base,plan:'trial'},{compact:true}),/Revisar plan/);
});
