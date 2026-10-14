import type { NextConfig } from "next";

// The document parser runs in a worker thread and loads these files at runtime.
const PARSER_FILES = [
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
];

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdf-parse", "exceljs", "mammoth", "papaparse", "tesseract.js", "sharp", "@tesseract.js-data/spa", "@tesseract.js-data/eng"],
  outputFileTracingIncludes: { "/api/jarvis/files{,/**}": PARSER_FILES, "/api/catalog/{import,images}": PARSER_FILES },
  // Product photos live in the public Supabase bucket "product-images".
  images: { remotePatterns: [{ protocol: "https", hostname: "*.supabase.co", pathname: "/storage/v1/object/public/product-images/**" }] },
  async headers() {
    return [{ source: "/sw.js", headers: [
      { key: "Content-Type", value: "application/javascript; charset=utf-8" },
      { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
      { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
    ] }];
  },
};

export default nextConfig;
