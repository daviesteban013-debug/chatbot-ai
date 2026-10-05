import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm, rename } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { EnvSync, parseLocalEnv } from "./env-sync.mjs";

async function setup(t, text, initial = []) {
  const root = await mkdtemp(path.join(tmpdir(), "chatbot-env-test-"));
  await mkdir(path.join(root, ".vercel"));
  await writeFile(path.join(root, ".vercel", "project.json"), JSON.stringify({ projectId: "prj_test", orgId: "team_test", projectName: "test" }));
  await writeFile(path.join(root, ".env.local"), text);
  const rows = structuredClone(initial);
  const calls = [];
  let clock = Date.now();
  const api = async (_root, endpoint, method, body) => {
    if (method === "GET") return { envs: structuredClone(rows) };
    calls.push({ endpoint, method, body });
    if (method === "POST") {
      const row = { id: `env_${rows.length}`, ...body, updatedAt: ++clock };
      rows.push(row);
      return { created: structuredClone(row), failed: [] };
    }
    const id = endpoint.split("/env/")[1].split("?")[0];
    const row = rows.find((item) => item.id === id);
    Object.assign(row, body, { updatedAt: ++clock });
    return structuredClone(row);
  };
  const sync = new EnvSync(root, { api, deploys: async () => ({ deployments: [] }) });
  t.after(async () => {
    await sync.pending;
    assert.equal(path.dirname(root), path.resolve(tmpdir()));
    assert.ok(path.basename(root).startsWith("chatbot-env-test-"));
    await rm(root, { recursive: true, force: true });
  });
  await sync.configure(true, ["production"]);
  return { root, sync, rows, calls, api };
}

test("parses multiline values, interpolation and escaped dollars without executing commands", () => {
  const parsed = parseLocalEnv('HOST=example.com\nURL=https://${HOST}/api\nSECRET="line1\\nline2"\nDOLLAR="pass\\$word"\nCOMMAND=$(echo should-never-run)\nVERCEL_OIDC_TOKEN=internal\nEMPTY=\n');
  assert.equal(parsed.values.URL, "https://example.com/api");
  assert.equal(parsed.values.SECRET, "line1\nline2");
  assert.equal(parsed.values.DOLLAR, "pass$word");
  assert.equal(parsed.values.COMMAND, "$(echo should-never-run)");
  assert.equal(parsed.skipped.length, 2);
  assert.throws(() => parseLocalEnv('KEY="unfinished'), /comillas/);
  assert.throws(() => parseLocalEnv('KEY=${MISSING}'), /no definida/);
  assert.throws(() => parseLocalEnv('A=$B\nB=$A'), /circular/);
  assert.throws(() => parseLocalEnv('KEY=one\nKEY=two'), /duplicada/);
});

test("syncs only Production, protects private values, stays idempotent and does not delete remote keys", async (t) => {
  const { root, sync, rows, calls } = await setup(t, 'PRIVATE_KEY=private-test-value\nNEXT_PUBLIC_URL=https://example.com\nEMPTY=\nVERCEL_OIDC_TOKEN=platform-test-value');
  const result = await sync.sync();
  assert.equal(result.updated.length, 2);
  assert.deepEqual(result.failed, []);
  assert.deepEqual(rows.map((row) => row.target), [["production"], ["production"]]);
  assert.equal(rows[0].type, "sensitive");
  assert.equal(rows[1].type, "encrypted");
  const status = await sync.inspect();
  const state = await readFile(path.join(sync.dir, "env-sync-state.json"), "utf8");
  for (const report of [JSON.stringify(result), JSON.stringify(status), state]) {
    assert.ok(!report.includes("private-test-value"));
    assert.ok(!report.includes("platform-test-value"));
  }
  await sync.sync();
  assert.equal(calls.length, 2);
  await writeFile(path.join(root, ".env.local"), "PRIVATE_KEY=\n");
  await sync.sync();
  assert.equal(calls.length, 2);
  assert.equal(rows[0].value, "private-test-value");
});

test("splits shared scopes without changing Preview values", async (t) => {
  const { sync, rows } = await setup(t, "PRIVATE_KEY=new-production-value", [{ id: "shared", key: "PRIVATE_KEY", value: "old-preview-value", target: ["production", "preview"], type: "encrypted", updatedAt: 1 }]);
  const result = await sync.sync();
  assert.equal(result.failed.length, 0);
  assert.equal(rows.find((row) => row.id === "shared").value, "old-preview-value");
  assert.deepEqual(rows.find((row) => row.id === "shared").target, ["preview"]);
  assert.equal(rows.find((row) => row.target.includes("production")).value, "new-production-value");
});

test("updates existing encrypted secrets without an unsupported storage conversion", async (t) => {
  const { sync, rows, calls } = await setup(t, "PRIVATE_KEY=new-value", [{ id: "existing", key: "PRIVATE_KEY", value: "old-value", target: ["production"], type: "encrypted", updatedAt: 1 }]);
  const result = await sync.sync();
  assert.equal(result.failed.length, 0);
  assert.equal(rows[0].value, "new-value");
  assert.equal(rows[0].type, "encrypted");
  assert.equal(calls[0].body.type, undefined);
});

test("restores shared scopes on creation failure and does not echo error payloads", async (t) => {
  const setupResult = await setup(t, "PRIVATE_KEY=do-not-print", [{ id: "shared", key: "PRIVATE_KEY", value: "old", target: ["production", "preview"], type: "encrypted" }]);
  const { root, api, rows } = setupResult;
  const sync = new EnvSync(root, { api: (...args) => {
    if (args[2] === "POST") throw new Error(`server echoed ${args[3].value}`);
    return api(...args);
  }, deploys: async () => ({ deployments: [] }) });
  const result = await sync.sync();
  assert.equal(result.failed.length, 1);
  assert.deepEqual(rows[0].target, ["production", "preview"]);
  assert.ok(!JSON.stringify(result).includes("do-not-print"));
});

test("refuses to send credentials after Vercel project relinking", async (t) => {
  const { root, sync, calls } = await setup(t, "PRIVATE_KEY=private-test-value");
  await writeFile(path.join(root, ".vercel", "project.json"), JSON.stringify({ projectId: "prj_other", orgId: "team_test" }));
  await assert.rejects(sync.sync(), /vinculación.*cambió/);
  assert.equal(calls.length, 0);
});

test("watches an atomic save and uploads the changed value automatically", async (t) => {
  const { root, sync, rows } = await setup(t, "PRIVATE_KEY=first-value");
  await sync.sync();
  let ready;
  const startup = new Promise((resolve) => { ready = resolve; });
  const changed = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Watcher did not sync")), 7000);
    const stop = sync.startWatching((result) => {
      if (!result.updated?.length) ready();
      if (result.updated?.length && rows[0].value === "second-value") { clearTimeout(timeout); stop(); resolve(); }
    });
    t.after(() => { clearTimeout(timeout); stop(); });
  });
  await startup;
  await writeFile(path.join(root, ".env.local.tmp"), "PRIVATE_KEY=second-value");
  await rename(path.join(root, ".env.local.tmp"), path.join(root, ".env.local"));
  await changed;
  assert.equal(rows[0].value, "second-value");
});
