import test from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";

test("stdio initializes, advertises all tools and rejects invalid inputs", async (t) => {
  const transport = new StdioClientTransport({ command: process.execPath, args: [fileURLToPath(new URL("./server.mjs", import.meta.url))], env: { MCP_ENV_SYNC_WATCH: "0" }, stderr: "pipe" });
  const client = new Client({ name: "mcp-protocol-test", version: "1.0.0" });
  t.after(() => client.close());
  await client.connect(transport);
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((tool) => tool.name).sort(), ["estado_proyecto", "programar", "estado_tarea", "continuar_tarea", "cancelar_tarea", "estado_github", "estado_deploys", "revisar_entrega", "estado_env", "sincronizar_env", "configurar_sync_env"].sort());
  const result = await client.callTool({ name: "estado_proyecto", arguments: {} });
  assert.equal(result.structuredContent.ok, true);
  assert.ok(result.structuredContent.data.project.endsWith("Chatbot.ai"));
  for (const [name, args] of [["programar", { instrucciones: "x" }], ["estado_tarea", { task_id: "../../secret" }], ["programar", { instrucciones: "Una tarea válida", cwd: "C:/" }]]) {
    const invalid = await client.callTool({ name, arguments: args });
    assert.equal(invalid.isError, true);
  }
});
