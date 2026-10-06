import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { documentImage } from "./ocr-fixtures.mjs";

import parserWorker from "../../lib/files/parser-worker.cjs";
const { parseDocument } = parserWorker;
const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const compile = source => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const workerSource = (await readFile(new URL("../../lib/files/parser.ts", import.meta.url), "utf8")).replace('import "server-only";', "");
const { parseFile } = await import(moduleUrl(compile(workerSource)));
const toolsSource = (await readFile(new URL("../../lib/files/tools.ts", import.meta.url), "utf8")).replace('"decimal.js"', JSON.stringify(import.meta.resolve("decimal.js")));
const { executeFileTool, fileContext } = await import(moduleUrl(compile(toolsSource)));
const document = parsed => ({ id: "11111111-1111-4111-8111-111111111111", name: "ventas.xlsx", ...parsed, warnings: parsed.warnings ?? [], references: parsed.sections.length });

function pdf(pages) {
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", `<< /Type /Pages /Kids [${pages.map((_, i) => `${4 + i * 2} 0 R`).join(" ")}] /Count ${pages.length} >>`, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"];
  pages.forEach((text, index) => {
    const stream = `BT /F1 12 Tf 40 700 Td (${text}) Tj ET`;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + index * 2} 0 R >>`, `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  });
  let content = "%PDF-1.4\n", offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(content)); content += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const start = Buffer.byteLength(content);
  content += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, "0")} 00000 n `).join("\n")}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  return Buffer.from(content);
}

test("actual PDF parser extracts text with page references and marks image-only/empty PDFs as needing OCR", async () => {
  const parsed = await parseDocument(pdf(["Ventas octubre: 300", "Ventas noviembre: 450"]), "ventas.pdf");
  assert.equal(parsed.sections.length, 2); assert.equal(parsed.sections[1].reference, "página 2"); assert.match(parsed.sections[1].text, /450/);
  const blank = await parseDocument(pdf([""]), "escaneo.pdf");
  assert.equal(blank.status, "needs_ocr"); assert.equal(blank.sections.length, 0); assert.match(blank.warnings.join(" "), /OCR/);
});

test("XLSX preserves sheet/cell references, cached formulas and numeric values without recalculating", async () => {
  const workbook = new ExcelJS.Workbook(), sheet = workbook.addWorksheet("Ventas");
  sheet.addRow(["Producto", "Total"]); sheet.addRow(["Pan", 0.1]); sheet.addRow(["Leche", 0.2]);
  sheet.getCell("B4").value = { formula: "SUM(B2:B3)", result: 0.3 };
  sheet.getCell("B5").value = { formula: "B4*2" };
  const parsed = await parseDocument(Buffer.from(await workbook.xlsx.writeBuffer()), "ventas.xlsx");
  assert.equal(parsed.sections[1].numbers.B, 0.1); assert.match(parsed.sections[3].text, /B4: 0.3.*SUM/);
  assert.equal(parsed.sections[4].numbers.B, undefined); assert.match(parsed.warnings.join(" "), /resultado guardado/);
  const file = document(parsed);
  const result = executeFileTool("calculate_sheet_column", { file_id: file.id, sheet: "Ventas", column: "B", first_row: 2, last_row: 3, operation: "sum" }, [file]);
  assert.equal(result.data.result, "0.3"); assert.equal(result.data.numericCells, 2); assert.equal(result.data.reference, "hoja Ventas, B2:B3");
});

test("CSV respects quoted multiline cells and semicolons; text keeps original line numbers", async () => {
  const parsed = await parseDocument(Buffer.from('Producto;Ventas\n"Pan\nIntegral";15\nLeche;20'), "ventas.csv");
  assert.equal(parsed.sections.length, 3); assert.match(parsed.sections[1].text, /Pan\nIntegral/); assert.equal(parsed.sections[2].numbers.B, 20);
  const single = await parseDocument(Buffer.from("Total\n300"), "una-columna.csv");
  assert.equal(single.sections[1].numbers.A, 300);
  await assert.rejects(parseDocument(Buffer.from('A,B\n"sin cerrar,3'), "mal.csv"), /comillas/);
  const txt = await parseDocument(Buffer.from("primera\n\ntercera"), "notas.txt");
  assert.deepEqual(txt.sections.map(s => s.reference), ["línea 1", "línea 3"]);
});

test("DOCX reads real Office ZIP content and returns plain paragraphs rather than HTML", async () => {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file("word/document.xml", '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Contrato de venta</w:t></w:r></w:p><w:p><w:r><w:t>Total: 500</w:t></w:r></w:p></w:body></w:document>');
  const parsed = await parseDocument(await zip.generateAsync({ type: "nodebuffer" }), "contrato.docx");
  assert.equal(parsed.sections[1].reference, "párrafo 2"); assert.equal(parsed.sections[1].text, "Total: 500");
});

test("parser rejects renamed binaries, unsupported formats, macros and oversized expanded ZIPs", async () => {
  for (const [name, bytes] of [["bad.pdf", Buffer.from("not a PDF")], ["bad.xlsx", Buffer.from("text")], ["bad.txt", Buffer.from([0xff, 0xfe])], ["bad.exe", Buffer.from("binary")], ["empty.txt", Buffer.alloc(0)]]) await assert.rejects(parseDocument(bytes, name));
  const zip = new JSZip(); zip.file("xl/workbook.xml", "data"); zip.file("xl/vbaProject.bin", "macro");
  await assert.rejects(parseDocument(await zip.generateAsync({ type: "nodebuffer" }), "macros.xlsx"), /sin macros/);
  const huge = new JSZip(); huge.file("word/document.xml", "x".repeat(25 * 1024 * 1024));
  await assert.rejects(parseDocument(await huge.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }), "huge.docx"), /descomprimido/);
});

test("limits expose partial extraction and tools cannot read a file outside the authorized set", async () => {
  const parsed = await parseDocument(Buffer.from("a".repeat(210000)), "grande.txt");
  assert.equal(parsed.truncated, true); assert.equal(parsed.sections[0].text.length, 200000);
  const file = document(parsed);
  assert.equal(executeFileTool("read_attachment", { file_id: "other" }, [file]).ok, false);
  const read = executeFileTool("read_attachment", { file_id: file.id, limit: 1 }, [file]);
  assert.equal(read.data.partialExtraction, true); assert.equal(read.data.excerpts[0].truncatedText, true);
  assert.ok(fileContext([file], "grande").length < 15000);
});

test("worker runs the real parser in isolation and pre-canceled requests never start parsing", async () => {
  const result = await parseFile(Buffer.from("archivo probado"), "notas.txt", new AbortController().signal);
  assert.equal(result.sections[0].text, "archivo probado");
  const abort = new AbortController(); abort.abort(); await assert.rejects(parseFile(Buffer.from("x"), "notas.txt", abort.signal), /cancelada/);
});
test("isolated worker returns OCR results after progress messages and aborts active recognition", async () => {
  const result = await parseFile(documentImage(), "foto.png", new AbortController().signal);
  assert.match(result.sections[0].text, /82741/);
  // Wait for worker termination to release its slot before starting another.
  await new Promise(resolve => setTimeout(resolve, 100));
  const controller = new AbortController();
  const pending = parseFile(documentImage(), "cancelada.png", controller.signal);
  setTimeout(() => controller.abort(), 150);
  await assert.rejects(pending, /cancelada/);
});

test("numeric operations validate ranges, ignore missing cached values and preserve a partial-data warning", () => {
  const file = document({ truncated: true, status: "ready", sections: [{ reference: "fila 2", sheet: "CSV", row: 2, text: "1", numbers: { A: 10 } }, { reference: "fila 3", sheet: "CSV", row: 3, text: "2", numbers: { A: 20 } }, { reference: "fila 4", sheet: "CSV", row: 4, text: "sin resultado", numbers: {} }] });
  const base = { file_id: file.id, sheet: "CSV", column: "A", first_row: 2, last_row: 4 };
  for (const [operation, expected] of [["average", "15"], ["min", "10"], ["max", "20"], ["count", "2"]]) {
    const result = executeFileTool("calculate_sheet_column", { ...base, operation }, [file]); assert.equal(result.data.result, expected); assert.equal(result.data.partialExtraction, true); assert.equal(result.data.nonNumericOrEmptyRows, 1);
  }
  assert.equal(executeFileTool("calculate_sheet_column", { ...base, operation: "sum", first_row: -1 }, [file]).ok, false);
  assert.equal(executeFileTool("read_attachment", { file_id: file.id, limit: 99 }, [file]).ok, false);
});
