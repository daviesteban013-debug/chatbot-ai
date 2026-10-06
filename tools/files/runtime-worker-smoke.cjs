/* eslint-disable @typescript-eslint/no-require-imports */
const { Worker } = require("node:worker_threads");
const assert = require("node:assert/strict");
const fs = require("node:fs");
async function run() {
  const fixtures = JSON.parse(fs.readFileSync(0, "utf8"));
  for (const [name, encoded, expected] of fixtures) {
    const result = await new Promise((resolve, reject) => {
      const worker = new Worker(process.argv[2], { workerData: { name, data: Buffer.from(encoded, "base64") } });
      const timer = setTimeout(() => { void worker.terminate(); reject(new Error(`${name}: timeout`)); }, 45_000);
      worker.on("message", async message => {
        if (message.ocrDirectory) return;
        clearTimeout(timer); await worker.terminate();
        if (message.ok) resolve(message.result); else reject(new Error(`${name}: ${message.error}`));
      });
      worker.once("error", error => { clearTimeout(timer); reject(error); });
    });
    assert.equal(result.status, "ready", `${name}: ${result.warnings.join(" ")}`);
    assert.ok(result.sections.some(section => section.text.includes(expected)), name);
    console.log(`${name}: isolated production dependencies OK`);
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
