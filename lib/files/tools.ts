import Decimal from "decimal.js";
import type { LLMTool } from "@/lib/llm/types";
import type { AttachedFile } from "./types";

export const FILE_TOOLS: LLMTool[] = [
  { type: "function", function: { name: "read_attachment", description: "Lee fragmentos de un adjunto de esta conversación. Usa query para buscar o start para recorrer secciones. Cita el nombre y la referencia de origen. No afirma que un fragmento sea todo el archivo.", parameters: { type: "object", properties: { file_id: { type: "string" }, query: { type: "string" }, start: { type: "integer", minimum: 0 }, limit: { type: "integer", minimum: 1, maximum: 12 } }, required: ["file_id"] } } },
  { type: "function", function: { name: "calculate_sheet_column", description: "Calcula sum, average, min, max o count sobre valores numéricos guardados en una columna de XLSX/CSV, en una hoja y un rango de filas. No recalcula fórmulas ni interpreta números locales ambiguos de CSV. Si el archivo es parcial, el resultado solo cubre filas extraídas.", parameters: { type: "object", properties: { file_id: { type: "string" }, sheet: { type: "string" }, column: { type: "string", description: "Letra de columna: A, B, AA…" }, operation: { type: "string", enum: ["sum", "average", "min", "max", "count"] }, first_row: { type: "integer", minimum: 1 }, last_row: { type: "integer", minimum: 1 } }, required: ["file_id", "sheet", "column", "operation"] } } },
];
const terms = (query: string) => Array.from(new Set(query.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").match(/[a-z0-9]{3,}/g) ?? []));
const score = (text: string, words: string[]) => { const normalized = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); return words.reduce((n, word) => n + (normalized.includes(word) ? 1 : 0), 0); };
export function fileContext(files: AttachedFile[], query: string) {
  const words = terms(query); let remaining = 12000;
  return JSON.stringify(files.map(file => {
    const ranked = file.sections.map((section, index) => ({ section, index, score: score(section.reference + " " + section.text, words) })).sort((a, b) => b.score - a.score || a.index - b.index);
    const excerpts = [];
    for (const { section } of ranked.slice(0, 5)) {
      if (remaining < 200) break;
      const text = section.text.slice(0, Math.min(2000, remaining)); remaining -= text.length;
      excerpts.push({ reference: section.reference, text, extraction: section.extraction, ocrConfidence: section.ocrConfidence });
    }
    return { id: file.id, name: file.name, status: file.status, warnings: file.warnings, partialExtraction: file.truncated, sectionsAvailable: file.sections.length, excerpts, excerptOnly: excerpts.length < file.sections.length };
  }));
}
export function executeFileTool(name: string, args: Record<string, unknown>, files: AttachedFile[]) {
  const file = files.find(file => file.id === args.file_id);
  if (!file) return { ok: false, error: "El archivo no está disponible en esta conversación." };
  if (file.status === "needs_ocr") return { ok: false, error: "El archivo no contiene texto legible disponible. Consulta sus avisos o vuelve a leerlo con OCR desde Jarvis.", warnings: file.warnings };
  if (name === "read_attachment") {
    if (args.query !== undefined && (typeof args.query !== "string" || args.query.length > 200)) return { ok: false, error: "Búsqueda no válida." };
    const start = args.start ?? 0, limit = args.limit ?? 6;
    if (typeof start !== "number" || !Number.isInteger(start) || start < 0 || typeof limit !== "number" || !Number.isInteger(limit) || limit < 1 || limit > 12) return { ok: false, error: "Rango de lectura no válido." };
    const words = terms(typeof args.query === "string" ? args.query : "");
    const ranked = file.sections.map((section, index) => ({ section, index, score: score(section.reference + " " + section.text, words) }));
    if (words.length) ranked.sort((a, b) => b.score - a.score || a.index - b.index);
    let remaining = 12000;
    const excerpts = ranked.slice(start, start + limit).map(({ section, index }) => { const text = section.text.slice(0, Math.min(3000, remaining)); remaining -= text.length; return { index, reference: section.reference, text, extraction: section.extraction, ocrConfidence: section.ocrConfidence, truncatedText: text.length < section.text.length }; });
    return { ok: true, data: { name: file.name, warnings: file.warnings, partialExtraction: file.truncated, totalSections: file.sections.length, nextStart: start + excerpts.length, excerpts } };
  }
  if (name === "calculate_sheet_column") {
    const first = args.first_row ?? 1, last = args.last_row ?? 5000;
    if (typeof args.sheet !== "string" || typeof args.column !== "string" || !/^[A-Z]{1,3}$/i.test(args.column) || !["sum", "average", "min", "max", "count"].includes(String(args.operation)) || typeof first !== "number" || typeof last !== "number" || !Number.isInteger(first) || !Number.isInteger(last) || first < 1 || last < first || last > 5000) return { ok: false, error: "Indica hoja, columna, operación y filas válidas." };
    const column = args.column.toUpperCase();
    const rows = file.sections.filter(section => section.sheet === args.sheet && section.row! >= first && section.row! <= last);
    if (!rows.length) return { ok: false, error: "No encontré esa hoja o rango en el contenido extraído." };
    const values = rows.flatMap(section => typeof section.numbers?.[column] === "number" ? [new Decimal(section.numbers[column])] : []);
    if (!values.length) return { ok: false, error: "No hay valores numéricos guardados en esa columna y rango." };
    const sum = values.reduce((total, n) => total.plus(n), new Decimal(0));
    const value = args.operation === "count" ? new Decimal(values.length) : args.operation === "sum" ? sum : args.operation === "average" ? sum.div(values.length) : values.reduce((a, b) => args.operation === "min" ? Decimal.min(a, b) : Decimal.max(a, b));
    return { ok: true, data: { name: file.name, reference: `hoja ${args.sheet}, ${column}${first}:${column}${last}`, operation: args.operation, result: value.toString(), numericCells: values.length, nonNumericOrEmptyRows: rows.length - values.length, partialExtraction: file.truncated, warnings: file.warnings } };
  }
  return { ok: false, error: "Herramienta de archivo no válida." };
}
