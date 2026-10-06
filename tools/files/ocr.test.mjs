import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import parser from "../../lib/files/parser-worker.cjs";
import { documentImage, scannedPdf } from "./ocr-fixtures.mjs";

test("OCR reads real PNG/JPEG/WebP photos with Spanish/English models and confidence", async () => {
  const image = documentImage();
  for (const [name, data] of [["foto.png", image], ["foto.jpg", await sharp(image).jpeg().toBuffer()], ["foto.webp", await sharp(image).webp().toBuffer()]]) {
    const result = await parser.parseDocument(data, name);
    assert.equal(result.status, "ready"); assert.match(result.sections[0].text, /82741/);
    assert.match(result.sections[0].text, /3500/); assert.equal(result.sections[0].extraction, "ocr");
    assert.ok(result.sections[0].ocrConfidence >= 65); assert.match(result.warnings.join(" "), /original/);
  }
});
test("OCR reads actual scanned PDF pages and preserves mixed digital references", async () => {
  const result = await parser.parseDocument(await scannedPdf({ nativePage: true }), "mixto.pdf");
  assert.equal(result.status, "ready"); assert.equal(result.sections.length, 2);
  assert.equal(result.sections[0].reference, "página 1"); assert.match(result.sections[0].text, /12345/);
  assert.equal(result.sections[1].reference, "página 2 (OCR)"); assert.match(result.sections[1].text, /82741/);
});
test("OCR bounds scanned pages and reports partial extraction", async () => {
  const result = await parser.parseDocument(await scannedPdf({ pages: 9 }), "largo.pdf");
  assert.equal(result.sections.length, 8); assert.equal(result.truncated, true);
  assert.match(result.warnings.join(" "), /8 páginas/);
});
test("OCR rejects renamed images and excessive pixel counts, and blank images remain unreadable", async () => {
  await assert.rejects(parser.parseDocument(documentImage(), "renombrada.jpg"), /extensión/);
  await assert.rejects(parser.parseDocument(Buffer.from("not an image"), "foto.png"), /imagen/);
  const large = await sharp({ create: { width: 4000, height: 4000, channels: 3, background: "white" } }).png().toBuffer();
  await assert.rejects(parser.parseDocument(large, "grande.png"), /megapíxeles/);
  const blank = await sharp({ create: { width: 600, height: 400, channels: 3, background: "white" } }).png().toBuffer();
  const result = await parser.parseDocument(blank, "vacia.png");
  assert.equal(result.status, "needs_ocr"); assert.equal(result.sections.length, 0); assert.match(result.warnings.join(" "), /no encontró texto legible/);
});
