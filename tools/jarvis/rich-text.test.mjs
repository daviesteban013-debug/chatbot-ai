import assert from "node:assert/strict";
import { test } from "node:test";
import { moduleUrl } from "../lib/load-module.mjs";

const { parseRichText, parseInline, plainText, safeHref } = await import(await moduleUrl("lib/rich-text.ts"));

test("paragraphs keep Zorax's line breaks and emphasis", () => {
  const blocks = parseRichText("Ayer vendiste **$ 1.200.000** en 8 pedidos.\nZorax cerró *todos*.\n\nSegundo párrafo con `TU-40`.");
  assert.equal(blocks.length, 2);
  assert.deepEqual(blocks[0].c, [
    { t: "text", v: "Ayer vendiste " }, { t: "strong", c: [{ t: "text", v: "$ 1.200.000" }] }, { t: "text", v: " en 8 pedidos." },
    { t: "br" }, { t: "text", v: "Zorax cerró " }, { t: "em", c: [{ t: "text", v: "todos" }] }, { t: "text", v: "." },
  ]);
  assert.deepEqual(blocks[1].c.at(-2), { t: "code", v: "TU-40" });
});

test("lists, headings, quotes and tables become structure", () => {
  const blocks = parseRichText("## Pendientes\n- María espera un asesor\n- 3 pedidos por cobrar\n  por $ 450.000\n1. Revisar stock\n2) Llamar a Ana\n> Datos de tu CRM\n| Producto | Unidades |\n|---|---:|\n| Tenis Urban | 14 |\n| Gorra | 9 |");
  assert.deepEqual(blocks.map(block => block.t), ["h", "ul", "ol", "quote", "table"]);
  assert.equal(blocks[0].level, 2);
  assert.equal(blocks[1].items.length, 2);
  assert.deepEqual(blocks[1].items[1], [{ t: "text", v: "3 pedidos por cobrar" }, { t: "br" }, { t: "text", v: "por $ 450.000" }]);
  assert.deepEqual(blocks[2], { t: "ol", start: 1, items: [[{ t: "text", v: "Revisar stock" }], [{ t: "text", v: "Llamar a Ana" }]] });
  assert.deepEqual(blocks[4].head.map(cell => cell[0].v), ["Producto", "Unidades"]);
  assert.equal(blocks[4].rows.length, 2);
});

test("only CRM paths and https pages become links; everything else stays text", () => {
  assert.equal(safeHref("/dashboard/orders/abc-123"), "/dashboard/orders/abc-123");
  assert.equal(safeHref("/dashboard/../admin"), null);
  assert.equal(safeHref("javascript:alert(1)"), null);
  assert.equal(safeHref("http://insecure.test"), null);
  assert.equal(safeHref("https://user:pw@evil.test"), null);
  const inline = parseInline("Abre [Pedidos](/dashboard/orders), [esto](javascript:alert(1)) y https://nexo.test/ayuda.");
  assert.deepEqual(inline.filter(node => node.t === "link").map(node => node.href), ["/dashboard/orders", "https://nexo.test/ayuda"]);
  assert.ok(inline.some(node => node.t === "text" && node.v === "esto"), "a dangerous link keeps its text only");
});

test("model output is data: markup and odd markers never break the tree", () => {
  const blocks = parseRichText("<script>alert(1)</script> **sin cierre\n\n```\nconst x = 1;\n```\n\n---\n\n| solo | encabezado |");
  assert.equal(blocks[0].t, "p"); assert.equal(blocks[0].c[0].v, "<script>alert(1)</script> **sin cierre");
  assert.deepEqual(blocks[1], { t: "code", v: "const x = 1;" });
  assert.equal(blocks[2].t, "hr");
  assert.equal(blocks[3].t, "p", "a lone pipe line without a separator is just text");
  assert.equal(parseRichText("").length, 0);
});

test("plain text restores a readable version for the clipboard", () => {
  const text = plainText(parseRichText("**Hoy**\n- $ 600.000 en 4 pedidos\n- 2 por cobrar\n\n| A | B |\n|---|---|\n| 1 | 2 |"));
  assert.equal(text, "Hoy\n\n• $ 600.000 en 4 pedidos\n• 2 por cobrar\n\nA · B\n1 · 2");
});
