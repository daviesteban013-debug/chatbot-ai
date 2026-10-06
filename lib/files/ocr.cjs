/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { parentPort, isMainThread } = require("node:worker_threads");
const sharp = require("sharp");
const { createWorker, OEM } = require("tesseract.js");
const spanish = require("@tesseract.js-data/spa");
const english = require("@tesseract.js-data/eng");

async function imageForOcr(data, extension) {
  const image = sharp(data, { limitInputPixels: 12_000_000 });
  let metadata;
  try { metadata = await image.metadata(); } catch { throw new Error("El archivo de imagen no es válido o supera los 12 megapíxeles."); }
  const expected = { png: "png", jpg: "jpeg", jpeg: "jpeg", webp: "webp" };
  if (expected[extension] && metadata.format !== expected[extension]) throw new Error("La extensión no corresponde al contenido de la imagen.");
  if (!["png", "jpeg", "webp"].includes(metadata.format) || (metadata.pages ?? 1) > 1) throw new Error("El archivo debe ser una imagen PNG, JPG o WebP sin animación.");
  return image.rotate().resize({ width: 1800, height: 2400, fit: "inside", withoutEnlargement: true }).flatten({ background: "#ffffff" }).grayscale().normalise().png().toBuffer();
}

async function createOcr() {
  // Tesseract needs both language models in one directory. Only /tmp is writable
  // in serverless deployments; a unique directory avoids concurrent collisions.
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-ocr-"));
  if (!isMainThread) parentPort?.postMessage({ ocrDirectory: directory });
  let worker;
  try {
    for (const language of [spanish, english]) fs.copyFileSync(path.join(path.dirname(language.langPath), "4.0.0_best_int", `${language.code}.traineddata.gz`), path.join(directory, `${language.code}.traineddata.gz`));
    worker = await createWorker("spa+eng", OEM.LSTM_ONLY, { langPath: directory, cacheMethod: "none", logger: () => {} });
  } catch (error) { fs.rmSync(directory, { recursive: true, force: true }); throw error; }
  return {
    async read(data) {
      const { data: result } = await worker.recognize(data, { rotateAuto: true });
      const text = result.text.trim(), confidence = Math.round(result.confidence);
      return { text: confidence >= 35 && (text.match(/[\p{L}\p{N}]/gu)?.length ?? 0) >= 3 ? text : "", confidence };
    },
    async close() { try { await worker.terminate(); } finally { fs.rmSync(directory, { recursive: true, force: true }); } },
  };
}
module.exports = { createOcr, imageForOcr };
