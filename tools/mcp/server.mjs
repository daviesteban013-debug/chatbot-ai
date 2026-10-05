import { Codex } from "@openai/codex-sdk";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { realpath } from "node:fs/promises";
import path from "node:path";
import { TaskManager } from "./tasks.mjs";
import { githubStatus, deploymentStatus, deliveryStatus } from "./integrations.mjs";
import { EnvSync } from "./env-sync.mjs";

const exec = promisify(execFile);
const projectRoot = await realpath(path.resolve(fileURLToPath(new URL("../..", import.meta.url))));
const envSync = new EnvSync(projectRoot);
const manager = new TaskManager({
  codex: new Codex({
    // Do not recursively invoke the caller's MCP connections from a coding task.
    configOverrides: ["mcp_servers={}"],
    ...(process.env.MCP_CODEX_BIN ? { codexPathOverride: process.env.MCP_CODEX_BIN } : {}),
  }),
  projectRoot,
  stateDir: path.join(projectRoot, ".codex", "mcp-programador"),
  deliveryStatus: () => deliveryStatus(projectRoot),
});

const server = new McpServer({ name: "chatbot-programador", version: "1.0.0" }, {
  instructions: "Programa únicamente en este repositorio. programar y continuar_tarea devuelven un identificador inmediatamente. Consulta estado_tarea para seguir el trabajo hasta completed, failed, canceled o timed_out. No anuncies éxito si la tarea sigue running. Solo una tarea a la vez.",
});
const prompt = z.string().trim().min(10).max(24_000).describe("Instrucciones completas: objetivo, comportamiento esperado y criterios de aceptación.");
const taskId = z.string().uuid();
const readOnly = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
const writes = { readOnlyHint: false, destructiveHint: true, openWorldHint: true };
function register(name, description, inputSchema, annotations, action) {
  server.registerTool(name, { description, inputSchema, annotations }, async (args) => {
    try {
      const data = await action(args);
      return { structuredContent: { ok: true, data }, content: [{ type: "text", text: JSON.stringify(data) }] };
    } catch (error) {
      return { isError: true, content: [{ type: "text", text: error instanceof Error ? error.message : "Error inesperado." }] };
    }
  });
}

register("estado_proyecto", "Muestra la carpeta de trabajo y los cambios de Git antes de encargar una tarea.", z.strictObject({}), readOnly, async () => {
  const { stdout } = await exec("git", ["status", "--short"], { cwd: projectRoot, timeout: 10_000, windowsHide: true, maxBuffer: 64_000 });
  return { project: projectRoot, git_status: stdout.trim(), active_task: manager.active?.id ?? null };
});
register("programar", "Encarga una tarea completa a Codex sobre este proyecto: implementar, corregir, refactorizar o revisar. Devuelve task_id; consulta estado_tarea hasta que termine. Los cambios se hacen en archivos reales.", z.strictObject({
  instrucciones: prompt,
  modo: z.enum(["programar", "revisar"]).default("programar").describe("programar permite editar; revisar usa un entorno de solo lectura."),
}), writes, async ({ instrucciones, modo }) => {
  const task = await manager.start(instrucciones, modo);
  return { task_id: task.id, status: task.status, project: projectRoot, next: "Consulta estado_tarea con este task_id." };
});
register("estado_tarea", "Consulta progreso, archivos cambiados, comprobaciones y respuesta de una tarea. No inicia trabajo adicional.", z.strictObject({ task_id: taskId }), readOnly, async ({ task_id }) => ({ ...await manager.get(task_id) }));
register("continuar_tarea", "Continúa una tarea anterior conservando su conversación y su modo de permisos. Consulta estado_tarea hasta que termine.", z.strictObject({ task_id: taskId, instrucciones: prompt }), writes, async ({ task_id, instrucciones }) => {
  const task = await manager.continue(task_id, instrucciones);
  return { task_id: task.id, status: task.status, next: "Consulta estado_tarea con este task_id." };
});
register("cancelar_tarea", "Solicita detener la tarea activa. Los cambios ya hechos en archivos se conservan; consulta su estado para confirmar que terminó.", z.strictObject({ task_id: taskId }), { readOnlyHint: false, destructiveHint: false, openWorldHint: false }, async ({ task_id }) => ({ ...await manager.cancel(task_id) }));
register("estado_github", "Consulta la rama principal, último commit, PR abiertos, checks y ejecuciones de GitHub Actions de este repositorio.", z.strictObject({}), readOnly, () => githubStatus(projectRoot));
register("estado_deploys", "Consulta los últimos despliegues de Vercel, su estado y el commit publicado.", z.strictObject({ target: z.enum(["production", "preview", "all"]).default("production") }), readOnly, ({ target }) => deploymentStatus(projectRoot, target));
register("revisar_entrega", "Comprueba GitHub y producción juntos. Detecta CI fallido, despliegues fallidos y diferencias entre producción y el último commit.", z.strictObject({}), readOnly, () => deliveryStatus(projectRoot));
register("estado_env", "Comprueba nombres y entornos de variables locales y de Vercel, sin devolver valores ni credenciales. Muestra sincronización y despliegue pendiente.", z.strictObject({}), readOnly, () => envSync.inspect());
register("sincronizar_env", "Copia las variables configuradas de .env.local al proyecto Vercel vinculado, sin revelar sus valores. Requiere sincronización habilitada. No hace redeploy.", z.strictObject({}), { readOnlyHint: false, destructiveHint: true, openWorldHint: false }, () => envSync.sync());
register("configurar_sync_env", "Activa o pausa la sincronización automática de .env.local en los entornos elegidos. Guardar el archivo puede actualizar variables reales en Vercel.", z.strictObject({ enabled: z.boolean(), targets: z.array(z.enum(["production", "preview"])).min(1).default(["production"]) }), { readOnlyHint: false, destructiveHint: true, openWorldHint: false }, ({ enabled, targets }) => envSync.configure(enabled, targets));

const stopWatching = process.env.MCP_ENV_SYNC_WATCH === "0" ? () => {} : envSync.startWatching();

let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  stopWatching();
  await envSync.pending;
  await manager.close();
  await server.close();
}
server.server.onclose = () => { stopWatching(); void manager.close(); };
process.on("SIGINT", () => { void close(); });
process.on("SIGTERM", () => { void close(); });
await server.connect(new StdioServerTransport());
