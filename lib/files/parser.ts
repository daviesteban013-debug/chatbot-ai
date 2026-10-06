import "server-only";
import { Worker } from "node:worker_threads";
import path from "node:path";
import os from "node:os";
import { rm } from "node:fs/promises";
import type { ParsedFile } from "./types";

let active = 0;
export function parseFile(data: Uint8Array, name: string, signal: AbortSignal): Promise<ParsedFile> {
  if (active >= 2) return Promise.reject(new Error("El lector está ocupado. Inténtalo en unos segundos."));
  if (signal.aborted) return Promise.reject(new Error("La carga fue cancelada."));
  active++;
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(path.join(process.cwd(), "lib/files/parser-worker.cjs"), {
        workerData: { data, name }, resourceLimits: { maxOldGenerationSizeMb: 256, stackSizeMb: 4 },
      });
    } catch { active--; reject(new Error("No se pudo iniciar el lector de archivos.")); return; }
    let settled = false, ocrDirectory: string | undefined;
    const finish = (error?: Error, result?: ParsedFile) => {
      if (settled) return;
      settled = true; clearTimeout(timer); signal.removeEventListener("abort", cancel);
      void worker.terminate().catch(() => {}).finally(async () => {
        if (ocrDirectory) await rm(ocrDirectory, { recursive: true, force: true }).catch(() => {});
        active--;
      });
      if (error) reject(error); else resolve(result!);
    };
    const cancel = () => finish(new Error("La carga fue cancelada."));
    const timer = setTimeout(() => finish(new Error("El archivo tardó demasiado en leerse. Prueba uno más pequeño.")), 45_000);
    signal.addEventListener("abort", cancel, { once: true });
    worker.on("message", message => {
      if (typeof message.ocrDirectory === "string") {
        const directory = path.resolve(message.ocrDirectory);
        if (path.dirname(directory) === path.resolve(os.tmpdir()) && path.basename(directory).startsWith("jarvis-ocr-")) ocrDirectory = directory;
        return;
      }
      if (message.ok) finish(undefined, message.result);
      else finish(new Error(message.error));
    });
    worker.once("error", () => finish(new Error("No se pudo leer el archivo. Puede estar dañado o exceder los límites.")));
    worker.once("exit", () => { if (!settled) finish(new Error("El lector se interrumpió. Prueba un archivo más pequeño.")); });
    if (signal.aborted) cancel();
  });
}
