import { readFile } from "node:fs/promises";
import ts from "typescript";
export const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
export async function load(path, replacements = {}) {
  let source = await readFile(new URL(path, import.meta.url), "utf8");
  for (const [from, to] of Object.entries(replacements)) source = source.replaceAll(JSON.stringify(from), JSON.stringify(to));
  return moduleUrl(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText);
}
