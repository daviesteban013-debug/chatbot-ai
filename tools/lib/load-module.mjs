import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const root = process.cwd();
const require = createRequire(path.join(root, "package.json"));
const cache = new Map();
// Small CLI loader for the existing pure server TS modules. No generated files.
export async function moduleUrl(file, replacements = {}) {
  const absolute = path.resolve(root, file);
  if (cache.has(absolute)) return cache.get(absolute);
  let source = await readFile(absolute, "utf8");
  source = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  const specs = [...source.matchAll(/from\s+"([^"]+)"/g)].map(match => match[1]);
  for (const spec of specs) {
    let resolved = replacements[spec];
    if (!resolved) {
      if (spec.startsWith("@/")) resolved = await moduleUrl(`${spec.slice(2)}.ts`, replacements);
      else if (spec.startsWith(".")) resolved = await moduleUrl(path.resolve(path.dirname(absolute), `${spec}.ts`), replacements);
      else resolved = pathToFileURL(require.resolve(spec)).href;
    }
    source = source.replaceAll(`"${spec}"`, JSON.stringify(resolved));
  }
  const result = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
  cache.set(absolute, result);
  return result;
}
