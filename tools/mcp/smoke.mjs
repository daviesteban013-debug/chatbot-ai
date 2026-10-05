import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { readFile, unlink } from "node:fs/promises";

// Opt-in live check: uses the signed-in Codex account and can consume its quota.
const client = new Client({ name: "mcp-live-check", version: "1.0.0" });
const transport = new StdioClientTransport({ command: process.execPath, args: [fileURLToPath(new URL("./server.mjs", import.meta.url))], stderr: "pipe" });
try {
  await client.connect(transport);
  const delivery = await client.callTool({ name: "revisar_entrega", arguments: {} }, undefined, { timeout: 120_000 });
  assert.equal(delivery.structuredContent.ok, true);
  const snapshot = delivery.structuredContent.data;
  assert.ok(!snapshot.github.error, snapshot.github.error);
  assert.ok(!snapshot.vercel.error, snapshot.vercel.error);
  console.log(JSON.stringify({ github: snapshot.github.repo, sha: snapshot.github.sha, deployments: snapshot.vercel.deployments.length, latest_state: snapshot.vercel.deployments[0]?.state, alerts: snapshot.alerts }));
  const started = await client.callTool({ name: "programar", arguments: {
    instrucciones: "Lee solamente package.json y AGENTS.md. Indica el nombre del proyecto y sus scripts dev y build. No modifiques archivos ni ejecutes comandos de escritura.",
    modo: "revisar",
  } });
  assert.ok(!started.isError, JSON.stringify(started.content));
  const { task_id } = started.structuredContent.data;
  console.log(JSON.stringify({ task_id, status: "started" }));
  const deadline = Date.now() + 5 * 60_000;
  let task;
  do {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const state = await client.callTool({ name: "estado_tarea", arguments: { task_id } });
    task = state.structuredContent.data;
  } while (["running", "canceling"].includes(task.status) && Date.now() < deadline);
  console.log(JSON.stringify({ status: task.status, result: task.result, error: task.error, files: task.files }));
  assert.equal(task.status, "completed");
  assert.equal(task.files.length, 0);
  assert.match(task.result, /chatbot-ai/i);
  if (process.argv.includes("--write")) {
    const fixture = fileURLToPath(new URL("./.smoke.txt", import.meta.url));
    let exists = false;
    try { await readFile(fixture); exists = true; } catch (error) { if (error.code !== "ENOENT") throw error; }
    assert.equal(exists, false, "La prueba no sobrescribe archivos existentes.");
    const write = await client.callTool({ name: "programar", arguments: {
      instrucciones: "Prueba de integración autorizada: crea únicamente tools/mcp/.smoke.txt con el texto exacto MCP_OK seguido de un salto de línea. No modifiques ningún otro archivo, no hagas commits ni push. Verifica leyendo ese archivo y responde brevemente.", modo: "programar",
    } });
    assert.ok(!write.isError, JSON.stringify(write.content));
    const writeId = write.structuredContent.data.task_id;
    const writeDeadline = Date.now() + 5 * 60_000;
    do {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const state = await client.callTool({ name: "estado_tarea", arguments: { task_id: writeId } });
      task = state.structuredContent.data;
    } while (["running", "canceling"].includes(task.status) && Date.now() < writeDeadline);
    assert.equal(task.status, "completed", task.error ?? task.result);
    assert.equal((await readFile(fixture, "utf8")).replace(/\r\n/g, "\n"), "MCP_OK\n");
    // Only remove the exact fixture we verified and asked this test to create.
    await unlink(fixture);
    console.log(JSON.stringify({ write_check: "passed", task_id: writeId, fixture_removed: true }));
  }
} finally {
  await client.close();
}
