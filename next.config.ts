import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdf-parse", "exceljs", "mammoth", "papaparse", "tesseract.js", "sharp", "@tesseract.js-data/spa", "@tesseract.js-data/eng"],
  outputFileTracingIncludes: { "/api/jarvis/files{,/**}": [
    "./lib/files/parser-worker.cjs",
    "./lib/files/ocr.cjs",
    "./node_modules/pdf-parse/dist/pdf-parse/cjs/pdf.worker.mjs",
    "./node_modules/@napi-rs/canvas*/**/*",
    "./node_modules/tesseract.js/src/**/*",
    "./node_modules/tesseract.js-core/**/*",
    "./node_modules/wasm-feature-detect/**/*",
    "./node_modules/bmp-js/**/*",
    "./node_modules/@img/sharp*/**/*",
    "./node_modules/@tesseract.js-data/{spa,eng}/4.0.0_best_int/*.gz",
  ] },
  async headers() {
    return [{ source: "/sw.js", headers: [
      { key: "Content-Type", value: "application/javascript; charset=utf-8" },
      { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
      { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
    ] }];
  },
};

export default nextConfig;
