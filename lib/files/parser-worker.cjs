/* eslint-disable @typescript-eslint/no-require-imports */
const { parentPort, workerData, isMainThread } = require("node:worker_threads");
const MAX_TEXT = 200000;
const MAX_SECTIONS = 5000;

// Check the ZIP central directory before a library decompresses Office files.
function officeZip(data, required) {
  let end = -1;
  for (let i = data.length - 22; i >= Math.max(0, data.length - 65557); i--) {
    if (data.readUInt32LE(i) === 0x06054b50) { end = i; break; }
  }
  if (end < 0) throw new Error("El archivo Office no es válido.");
  const entries = data.readUInt16LE(end + 10), offset = data.readUInt32LE(end + 16);
  if (entries > 2000 || offset >= data.length || entries === 65535) throw new Error("El archivo Office es demasiado complejo.");
  let position = offset, expanded = 0, found = false;
  for (let i = 0; i < entries; i++) {
    if (position + 46 > end || data.readUInt32LE(position) !== 0x02014b50) throw new Error("El archivo Office no es válido.");
    const size = data.readUInt32LE(position + 24), length = data.readUInt16LE(position + 28);
    const extra = data.readUInt16LE(position + 30), comment = data.readUInt16LE(position + 32);
    if (position + 46 + length + extra + comment > end || size === 0xffffffff) throw new Error("El archivo Office no es válido.");
    expanded += size;
    if (expanded > 24 * 1024 * 1024) throw new Error("El archivo descomprimido es demasiado grande.");
    const name = data.subarray(position + 46, position + 46 + length).toString("utf8");
    if (name === required) found = true;
    if (/vbaProject\.bin$/i.test(name)) throw new Error("Usa una copia del archivo sin macros.");
    position += 46 + length + extra + comment;
  }
  if (!found) throw new Error("La extensión no corresponde al contenido del archivo.");
}

async function parseDocument(data, name) {
  data = Buffer.from(data);
  const extension = name.toLowerCase().split(".").pop();
  if (!data.length || data.length > 3 * 1024 * 1024) throw new Error("El archivo debe tener contenido y pesar hasta 3 MB.");
  const result = { sections: [], warnings: [], status: "ready", truncated: false };
  let characters = 0;
  const add = (reference, text, extra = {}) => {
    text = String(text).replace(/\u0000/g, "").trim();
    if (!text) return;
    if (result.sections.length >= MAX_SECTIONS || characters >= MAX_TEXT) { result.truncated = true; return; }
    if (characters + text.length > MAX_TEXT) { text = text.slice(0, MAX_TEXT - characters); result.truncated = true; }
    result.sections.push({ reference, text, ...extra }); characters += text.length;
  };
  if (extension === "pdf") {
    if (!data.subarray(0, 1024).includes(Buffer.from("%PDF-"))) throw new Error("El archivo no contiene un PDF válido.");
    const { PDFParse } = require("pdf-parse");
    const parser = new PDFParse({ data: new Uint8Array(data), isEvalSupported: false, maxImageSize: 12_000_000 });
    let ocr;
    try {
      const text = await parser.getText({ first: 80 });
      let scanned = 0, unreadable = 0;
      const deadline = Date.now() + 32_000;
      for (const page of text.pages) {
        if (page.text.trim()) { add(`página ${page.num}`, page.text); continue; }
        if (scanned >= 8 || Date.now() > deadline) { result.truncated = true; unreadable++; continue; }
        scanned++;
        try {
          const { createOcr } = require("./ocr.cjs");
          const pdfPage = await parser.doc.getPage(page.num);
          const viewport = pdfPage.getViewport({ scale: 1 });
          if (![viewport.width, viewport.height].every(n => Number.isFinite(n) && n > 0 && n <= 20000)) throw new Error("invalid page");
          const screenshot = await parser.getScreenshot({ partial: [page.num], scale: Math.min(2.5, 1800 / viewport.width, 2400 / viewport.height), imageBuffer: true, imageDataUrl: false });
          ocr ??= await createOcr();
          const recognized = await ocr.read(screenshot.pages[0].data);
          if (recognized.text) {
            add(`página ${page.num} (OCR)`, recognized.text, { extraction: "ocr", ocrConfidence: recognized.confidence });
            if (recognized.confidence < 65) result.warnings.push(`OCR de la página ${page.num} con baja confianza; verifica sus cifras en el original.`);
          } else unreadable++;
        } catch { unreadable++; }
      }
      if (text.total > 80) { result.truncated = true; result.warnings.push("Se leyeron las primeras 80 páginas."); }
      if (unreadable) { result.truncated = true; result.warnings.push(`${unreadable} páginas sin texto legible tras OCR o fuera del límite de 8 páginas escaneadas por archivo. Prueba un escaneo más claro o divide el PDF.`); }
      if (scanned) result.warnings.push("Texto reconocido por OCR: comprueba nombres y cifras importantes en el original.");
      if (!result.sections.length) result.status = "needs_ocr";
    } finally { if (ocr) await ocr.close(); await parser.destroy(); }
  } else if (["png", "jpg", "jpeg", "webp"].includes(extension)) {
    const { createOcr, imageForOcr } = require("./ocr.cjs");
    const image = await imageForOcr(data, extension);
    const ocr = await createOcr();
    try {
      const recognized = await ocr.read(image);
      add("imagen (OCR)", recognized.text, { extraction: "ocr", ocrConfidence: recognized.confidence });
      result.warnings.push("Texto reconocido por OCR: comprueba nombres y cifras importantes en el original.");
      if (!recognized.text) { result.status = "needs_ocr"; result.warnings.push("OCR no encontró texto legible. Prueba una foto más clara, bien iluminada y de frente."); }
      else if (recognized.confidence < 65) result.warnings.push("OCR con baja confianza; verifica sus cifras en el original.");
    } finally { await ocr.close(); }
  } else if (extension === "xlsx") {
    officeZip(data, "xl/workbook.xml");
    const ExcelJS = require("exceljs");
    const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(data);
    let uncached = 0;
    if (workbook.worksheets.length > 20) result.truncated = true;
    for (const sheet of workbook.worksheets.slice(0, 20)) {
      if (sheet.rowCount > 5000 || sheet.columnCount > 100) result.truncated = true;
      sheet.eachRow((row, number) => {
        if (number > 5000 || result.sections.length >= MAX_SECTIONS) { result.truncated = true; return; }
        const cells = [], numbers = {};
        row.eachCell((cell, column) => {
          if (column > 100) return;
          let value = cell.value;
          if (value == null) return;
          let formula = "";
          if (typeof value === "object" && ("formula" in value || "sharedFormula" in value)) {
            formula = ` [fórmula: ${value.formula || `compartida ${value.sharedFormula}`}]`;
            if (value.result == null) { uncached++; value = "resultado no guardado"; } else value = value.result;
          }
          if (typeof value === "number" && Number.isFinite(value)) numbers[excelColumn(column)] = value;
          if (value instanceof Date) value = value.toISOString();
          else if (typeof value === "object") value = value.richText ? value.richText.map(run => run.text).join("") : value.text ?? value.error ?? "";
          if (String(value).length > 2000) result.truncated = true;
          cells.push(`${cell.address}: ${String(value).slice(0, 2000)}${formula}`);
        });
        add(`hoja ${sheet.name}, fila ${number}`, cells.join(" | "), { sheet: sheet.name, row: number, numbers });
      });
    }
    if (uncached) result.warnings.push(`${uncached} fórmulas no tienen un resultado guardado. Abre, recalcula y guarda el Excel para obtenerlo.`);
    result.warnings.push("Las fórmulas muestran el último resultado guardado; no se recalculan ni se ejecutan macros.");
  } else if (extension === "docx") {
    officeZip(data, "word/document.xml");
    const mammoth = require("mammoth");
    const text = await mammoth.extractRawText({ buffer: data });
    text.value.split(/\n\s*\n/).forEach((paragraph, index) => add(`párrafo ${index + 1}`, paragraph));
  } else if (["csv", "txt", "md"].includes(extension)) {
    let text;
    try { text = new TextDecoder("utf-8", { fatal: true }).decode(data); } catch { throw new Error("Guarda el archivo de texto como UTF-8 e inténtalo de nuevo."); }
    if (text.includes("\u0000")) throw new Error("El archivo no contiene texto UTF-8 válido.");
    if (extension === "csv") {
      const Papa = require("papaparse");
      const parsed = Papa.parse(text, { skipEmptyLines: "greedy", preview: 5001 });
      // A valid one-column CSV has no delimiter for Papa Parse to detect.
      if (parsed.errors.some(error => error.code !== "UndetectableDelimiter" || parsed.data.some(row => row.length !== 1))) throw new Error("El CSV tiene comillas o separadores inválidos. Revisa el archivo.");
      if (parsed.data.length > 5000 || parsed.meta.truncated) result.truncated = true;
      parsed.data.slice(0, 5000).forEach((row, index) => {
        const numbers = {};
        const cells = row.slice(0, 100).map((value, column) => {
          const reference = excelColumn(column + 1);
          if (/^-?\d+(?:\.\d+)?$/.test(value.trim())) { const n = Number(value); if (Number.isFinite(n)) numbers[reference] = n; }
          return `${reference}${index + 1}: ${value}`;
        });
        if (row.length > 100) result.truncated = true;
        add(`hoja CSV, fila ${index + 1}`, cells.join(" | "), { sheet: "CSV", row: index + 1, numbers });
      });
    } else text.split("\n").forEach((line, index) => add(`línea ${index + 1}`, line));
  } else throw new Error("Formatos disponibles: PDF, PNG, JPG, WebP, XLSX, CSV, DOCX, TXT y MD.");
  if (result.truncated) result.warnings.push("El archivo excede el límite de lectura: los resultados solo abarcan el contenido extraído.");
  if (!result.sections.length && result.status !== "needs_ocr") throw new Error("No encontré contenido legible en este archivo.");
  return result;
}
function excelColumn(number) { let name = ""; while (number) { number--; name = String.fromCharCode(65 + number % 26) + name; number = Math.floor(number / 26); } return name; }
module.exports = { parseDocument };
if (!isMainThread) parseDocument(workerData.data, workerData.name).then(
  result => parentPort.postMessage({ ok: true, result }),
  error => parentPort.postMessage({ ok: false, error: /^(El archivo|La extensión|Usa una|Guarda el|Formatos disponibles|No encontré|El CSV)/.test(error.message) ? error.message : "No pude leer el archivo. Puede estar dañado, cifrado o protegido con contraseña." })
);
