import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Electron's sandboxed preload and main entry use CommonJS.
  { files: ["desktop/**/*.cjs"], rules: { "@typescript-eslint/no-require-imports": "off" } },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "desktop/dist/**",
    "next-env.d.ts",
    // Local tooling / logs (never lint):
    ".vercel-tmp/**",
    ".codex/**",
  ]),
]);

export default eslintConfig;
