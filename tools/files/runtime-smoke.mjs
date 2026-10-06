// Verify the deployed dependency trace without falling back to workspace packages.
import assert from "node:assert/strict";
import { readFile, mkdtemp, mkdir, copyFile, rm, lstat, realpath, symlink } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import { execFile } from "node:child_process";
import ExcelJS from "exceljs";
import JSZip from "jszip";

// Generate fixtures separately so the host holds no workspace native DLLs
// while verifying the isolated deployment package.
const fixtureUrl = new URL("./ocr-fixtures.mjs", import.meta.url).href;
const fixtureData = await new Promise((resolve, reject) => execFile(process.execPath, ["--input-type=module", "-e", `import { documentImage, scannedPdf } from ${JSON.stringify(fixtureUrl)}; console.log(JSON.stringify([documentImage().toString('base64'), (await scannedPdf()).toString('base64')]));`], { windowsHide: true, maxBuffer: 2_000_000 }, (error, stdout) => error ? reject(error) : resolve(JSON.parse(stdout).map(value => Buffer.from(value, "base64")))));

const workspace = process.cwd();
const tracePath = path.join(workspace, ".next/server/app/api/jarvis/files/route.js.nft.json");
const files = JSON.parse(await readFile(tracePath, "utf8")).files;
const root = await mkdtemp(path.join(os.tmpdir(), "jarvis-files-runtime-"));
assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
assert.ok(path.basename(root).startsWith("jarvis-files-runtime-"));
try {
  for (const file of new Set(files)) {
    const source = path.resolve(path.dirname(tracePath), file);
    const relative = path.relative(workspace, source);
    if (relative.startsWith("..") || path.isAbsolute(relative)) continue;
    if (!relative.startsWith(`node_modules${path.sep}`) && !relative.startsWith(path.join(".next", "node_modules") + path.sep) && !relative.startsWith(path.join(".next", "server", "chunks") + path.sep) && relative !== path.join("lib", "files", "parser-worker.cjs")) continue;
    const target = path.join(root, relative);
    await mkdir(path.dirname(target), { recursive: true });
    const info = await lstat(source);
    if (info.isSymbolicLink() || info.isDirectory()) {
      const resolved = path.relative(workspace, await realpath(source));
      assert.ok(resolved.startsWith(`node_modules${path.sep}`));
      await symlink(path.join(root, resolved), target, "junction");
    } else await copyFile(source, target);
  }
  const require = createRequire(path.join(root, "lib/files/parser-worker.cjs"));
  for (const name of ["pdf-parse", "exceljs", "mammoth", "papaparse", "tesseract.js", "sharp", "@tesseract.js-data/spa", "@tesseract.js-data/eng"]) assert.ok(require.resolve(name).startsWith(root + path.sep));
  const workerFile = files.map(file => path.resolve(path.dirname(tracePath), file)).find(file => path.basename(file).startsWith("[worker thread]-") && file.endsWith(".js"));
  assert.ok(workerFile, "The production parser worker must be traced");
  const bundledWorker = path.join(root, path.relative(workspace, workerFile));
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [4 0 R] /Count 1 >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 3 0 R >> >> /Contents 5 0 R >>"];
  const stream = "BT /F1 12 Tf 40 700 Td (Ventas: 300) Tj ET";
  objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  let pdf = "%PDF-1.4\n"; const offsets = [];
  objects.forEach((object, i) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${i + 1} 0 obj\n${object}\nendobj\n`; });
  const start = Buffer.byteLength(pdf);
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.map(n => `${String(n).padStart(10, "0")} 00000 n `).join("\n")}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  const workbook = new ExcelJS.Workbook(); workbook.addWorksheet("Ventas").addRow(["Total", 300]);
  const zip = new JSZip(); zip.file("[Content_Types].xml", '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>');
  zip.file("word/document.xml", '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Ventas: 300</w:t></w:r></w:p></w:body></w:document>');
  const fixtures = [["ventas.pdf", Buffer.from(pdf), "300"], ["ventas.xlsx", Buffer.from(await workbook.xlsx.writeBuffer()), "300"], ["ventas.docx", await zip.generateAsync({ type: "nodebuffer" }), "300"], ["ventas.csv", Buffer.from("Total\n300"), "300"], ["foto.png", fixtureData[0], "82741"], ["escaneo.pdf", fixtureData[1], "82741"]];
  // A child process releases native DLL handles before removing the trace on Windows.
  await new Promise((resolve, reject) => {
    const child = execFile(process.execPath, [path.join(workspace, "tools/files/runtime-worker-smoke.cjs"), bundledWorker], { windowsHide: true, timeout: 180_000, maxBuffer: 2_000_000 }, (error, stdout, stderr) => {
      if (stdout) process.stdout.write(stdout); if (stderr) process.stderr.write(stderr);
      if (error) reject(new Error("Isolated dependency verification failed")); else resolve();
    });
    child.stdin.end(JSON.stringify(fixtures.map(([name, data, expected]) => [name, data.toString("base64"), expected])));
  });
} finally {
  // Only remove the exact temporary directory created and checked above.
  await rm(root, { recursive: true, force: true });
}
