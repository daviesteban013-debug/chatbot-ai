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
const base = { plan: "esencial", quotaTokens: 1000, availableTokens: 650, usedTokens: 250, reservedTokens: 100, resetsAt: "2026-11-01T05:00:00Z" };
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
  }
});

test("exhaustion, low capacity and rounding cannot display a full or empty allowance incorrectly", () => {
  const exhausted = render({ ...base, availableTokens: 0 });
  assert.match(exhausted, /aria-valuenow="0"/); assert.match(exhausted, /Sin saldo disponible/);
  const fractional = render({ ...base, availableTokens: 1 });
  assert.match(fractional, /&lt;1 %/); assert.match(fractional, /10 % o menos/);
  const almostFull = render({ ...base, availableTokens: 999 });
  assert.match(almostFull, /99 %/); assert.doesNotMatch(almostFull, />100 %</);
  assert.match(render({ ...base, quotaTokens: 0, availableTokens: 0 }), /aria-valuenow="0"/);
  assert.match(render({ ...base, availableTokens: -50 }), /aria-valuenow="0"/);
  assert.match(render({ ...base, availableTokens: 1100 }), /aria-valuenow="100"/);
});

test("unavailable balances remain unavailable rather than showing a fabricated empty quota", () => {
  const html = render(null);
  assert.match(html, /Consultando créditos/);
  assert.doesNotMatch(html, /progressbar|0 %/);
});
