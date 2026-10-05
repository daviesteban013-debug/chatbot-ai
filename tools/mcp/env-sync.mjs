import { parse } from "dotenv";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, rename, open, unlink, stat } from "node:fs/promises";
import { watch } from "node:fs";
import path from "node:path";
import { vercelApi, deploymentStatus } from "./integrations.mjs";

const allowedTargets = new Set(["production", "preview"]);
const excluded = /^(?:VERCEL_|MCP_|CODEX_|DOTENV_|NODE_ENV$|PORT$|PATH$|HOME$|USERPROFILE$)/;
const configFilename = "env-sync-config.json";
const stateFilename = "env-sync-state.json";
async function readJson(file, fallback) {
  try { return JSON.parse(await readFile(file, "utf8")); } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw new Error("No se pudo leer la configuración local de sincronización.");
  }
}
async function writeJson(file, data) {
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${randomUUID()}.tmp`;
  await writeFile(temp, JSON.stringify(data, null, 2), { mode: 0o600 });
  await rename(temp, file);
}

export function parseLocalEnv(text) {
  // Reject half-written assignments rather than uploading incomplete secrets.
  let quote = null;
  const keys = new Set();
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (!quote && (!line.trim() || line.trimStart().startsWith("#"))) continue;
    let value = line;
    if (!quote) {
      const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!match) throw new Error(`Asignación inválida en .env.local, línea ${index + 1}.`);
      if (keys.has(match[1])) throw new Error(`Variable duplicada en .env.local: ${match[1]}.`);
      keys.add(match[1]);
      value = match[2];
      if (!["\"", "'", "`"].includes(value[0])) continue;
      quote = value[0];
      value = value.slice(1);
    }
    if (new RegExp(`(?<!\\\\)${quote}`).test(value)) quote = null;
  }
  if (quote) throw new Error("Hay un valor con comillas sin cerrar en .env.local.");
  const parsed = parse(text);
  const resolved = Object.create(null);
  const resolving = new Set();
  function resolve(key) {
    if (Object.hasOwn(resolved, key)) return resolved[key];
    if (!Object.hasOwn(parsed, key)) throw new Error(`Referencia no definida en .env.local: ${key}.`);
    if (resolving.has(key)) throw new Error(`Referencia circular en .env.local: ${key}.`);
    resolving.add(key);
    const value = parsed[key].replace(/(\\)?\$(?:\{([A-Za-z_][A-Za-z0-9_]*)\}|([A-Za-z_][A-Za-z0-9_]*))/g, (match, escaped, braced, bare) => escaped ? match.slice(1) : resolve(braced ?? bare));
    resolving.delete(key);
    resolved[key] = value;
    return value;
  }
  const values = Object.create(null);
  const skipped = [];
  for (const key of Object.keys(parsed)) {
    if (excluded.test(key)) { skipped.push({ key, reason: "local_or_platform" }); continue; }
    const value = resolve(key);
    if (!value.trim()) { skipped.push({ key, reason: "empty" }); continue; }
    values[key] = value;
  }
  return { values, skipped };
}

function remoteSignature(row) {
  return row ? JSON.stringify([row.id, row.updatedAt ?? row.createdAt, row.type, [...(row.target ?? [])].sort()]) : null;
}

export class EnvSync {
  constructor(projectRoot, { api = vercelApi, deploys = deploymentStatus } = {}) {
    this.projectRoot = projectRoot;
    this.api = (endpoint, method, body) => api(projectRoot, endpoint, method, body);
    this.deploys = () => deploys(projectRoot);
    this.dir = path.join(projectRoot, ".codex", "mcp-programador");
    this.pending = null;
  }

  async project() {
    const project = await readJson(path.join(this.projectRoot, ".vercel", "project.json"), null);
    if (!project?.projectId || !project?.orgId) throw new Error("Vincula este proyecto con vercel link antes de sincronizar variables.");
    return project;
  }

  async config() { return readJson(path.join(this.dir, configFilename), { enabled: false, targets: ["production"] }); }

  async configure(enabled, targets = ["production"]) {
    if (!targets.length || targets.some((target) => !allowedTargets.has(target))) throw new Error("Selecciona Production o Preview.");
    const project = await this.project();
    const config = { enabled, targets: [...new Set(targets)], projectId: project.projectId, orgId: project.orgId };
    await writeJson(path.join(this.dir, configFilename), config);
    return { enabled, targets: config.targets, project: project.projectName };
  }

  async local() {
    try { return parseLocalEnv(await readFile(path.join(this.projectRoot, ".env.local"), "utf8")); } catch (error) {
      if (error.code === "ENOENT") throw new Error("No existe .env.local en este proyecto.");
      throw error;
    }
  }

  async rows(project) {
    const query = new URLSearchParams({ teamId: project.orgId });
    const response = await this.api(`/v10/projects/${encodeURIComponent(project.projectId)}/env?${query}`, "GET");
    if (!Array.isArray(response.envs)) throw new Error("Vercel no devolvió la lista de variables.");
    // Discard all values, even encrypted ones; syncing needs metadata only.
    return response.envs.map(({ id, key, target, type, gitBranch, updatedAt, createdAt, configurationId, customEnvironmentIds }) => ({ id, key, target, type, gitBranch, updatedAt, createdAt, configurationId, customEnvironmentIds }));
  }

  async inspect() {
    const config = await this.config();
    const local = await this.local();
    const project = await this.project();
    const rows = await this.rows(project);
    const state = await readJson(path.join(this.dir, stateFilename), {});
    await this.refreshRedeploy(state);
    return {
      enabled: config.enabled, targets: config.targets, project: project.projectName,
      local_names: Object.keys(local.values), skipped: local.skipped,
      remote: rows.map(({ key, target, type, gitBranch }) => ({ key, target, type, branch_override: Boolean(gitBranch) })),
      last_sync: state.last_sync ?? null, last_result: state.last_result ?? null,
      needs_redeploy: Boolean(state.needs_redeploy),
    };
  }

  async sync() {
    if (this.pending) return this.pending;
    this.pending = this.perform().finally(() => { this.pending = null; });
    return this.pending;
  }

  async refreshRedeploy(state) {
    if (!state.needs_redeploy || !state.last_change_at) return;
    try {
      const { deployments } = await this.deploys();
      if (deployments.some((deployment) => deployment.state === "READY" && deployment.created_at > state.last_change_at)) state.needs_redeploy = false;
    } catch { /* Keep the pending flag when deployment verification is unavailable. */ }
  }

  async acquireLock() {
    await mkdir(this.dir, { recursive: true });
    const file = path.join(this.dir, "env-sync.lock");
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const handle = await open(file, "wx", 0o600);
        await handle.writeFile(JSON.stringify({ pid: process.pid }));
        await handle.close();
        return async () => { await unlink(file).catch(() => {}); };
      } catch (error) {
        if (error.code !== "EEXIST") throw new Error("No se pudo bloquear la sincronización de variables.");
        let owner;
        try { owner = JSON.parse(await readFile(file, "utf8")); } catch { return null; }
        if (!Number.isInteger(owner.pid) || owner.pid <= 0) return null;
        try { process.kill(owner.pid, 0); return null; } catch (check) {
          if (check.code !== "ESRCH") return null;
        }
        await unlink(file).catch(() => {});
      }
    }
    return null;
  }

  async perform() {
    const config = await this.config();
    if (!config.enabled) return { enabled: false, updated: [], needs_redeploy: false };
    const release = await this.acquireLock();
    if (!release) return { enabled: true, status: "busy", updated: [] };
    try {
      const project = await this.project();
      if (config.projectId !== project.projectId || config.orgId !== project.orgId) throw new Error("La vinculación de Vercel cambió. Configura nuevamente la sincronización antes de enviar variables.");
      const { values, skipped } = await this.local();
      const stateFile = path.join(this.dir, stateFilename);
      const state = await readJson(stateFile, { salt: randomBytes(32).toString("hex"), entries: {} });
      const rows = await this.rows(project);
      const query = new URLSearchParams({ teamId: project.orgId });
      const updated = [];
      const unchanged = [];
      const failed = [];
      for (const [key, value] of Object.entries(values)) {
        const matching = rows.filter((row) => row.key === key && !row.gitBranch && !(row.customEnvironmentIds?.length));
        const stamp = createHmac("sha256", state.salt).update(value).digest("hex");
        for (const target of config.targets) {
          const row = matching.find((item) => item.target?.includes(target));
          const entryKey = `${project.projectId}:${target}:${key}`;
          const old = state.entries[entryKey];
          if (old?.stamp === stamp && old?.remote === remoteSignature(row)) { unchanged.push({ key, target }); continue; }
          // Shared or integration-owned variables require their own management surface.
          if (row?.configurationId || (row && !["encrypted", "sensitive", "plain"].includes(row.type))) { failed.push({ key, target, reason: "managed_by_integration" }); continue; }
          const type = key.startsWith("NEXT_PUBLIC_") ? "encrypted" : "sensitive";
          try {
            let saved;
            if (row && row.target.length === 1) {
              // Preserve existing encryption. Vercel rejects some direct conversions
              // from encrypted to sensitive, even when a value update is allowed.
              saved = await this.api(`/v9/projects/${project.projectId}/env/${row.id}?${query}`, "PATCH", { value, ...(row.type === "plain" ? { type: "encrypted" } : {}) });
            } else {
              // Preserve values in other environments when splitting a shared record.
              if (row) await this.api(`/v9/projects/${project.projectId}/env/${row.id}?${query}`, "PATCH", { target: row.target.filter((item) => item !== target) });
              try {
                const response = await this.api(`/v10/projects/${project.projectId}/env?${query}`, "POST", { key, value, type, target: [target] });
                if (response.failed?.length || !response.created) throw new Error("No se pudo guardar una variable.");
                saved = Array.isArray(response.created) ? response.created[0] : response.created;
              } catch {
                if (row) await this.api(`/v9/projects/${project.projectId}/env/${row.id}?${query}`, "PATCH", { target: row.target });
                throw new Error("No se pudo guardar una variable.");
              }
            }
            if (!saved?.id || saved.key !== key || !saved.target?.includes(target)) throw new Error("Vercel no confirmó el cambio de variable.");
            state.entries[entryKey] = { stamp, remote: remoteSignature(saved) };
            state.needs_redeploy = true;
            state.last_change_at = Math.max(Date.now(), Number(saved.updatedAt) || 0);
            updated.push({ key, target });
            // Make subsequent targets see the new metadata, without any value.
            if (row) row.target = row.target.filter((item) => item !== target);
            matching.push({ id: saved.id, key: saved.key, target: saved.target, type: saved.type, updatedAt: saved.updatedAt, createdAt: saved.createdAt });
            await writeJson(stateFile, state);
          } catch { failed.push({ key, target, reason: "vercel_update_failed" }); }
        }
      }
      await this.refreshRedeploy(state);
      const result = { enabled: true, project: project.projectName, targets: config.targets, updated, unchanged, skipped, failed, needs_redeploy: Boolean(state.needs_redeploy), checked_at: new Date().toISOString() };
      state.last_sync = result.checked_at;
      state.last_result = result;
      await writeJson(stateFile, state);
      return result;
    } finally { await release(); }
  }

  startWatching(onResult = () => {}) {
    let stopped = false;
    let debounce;
    let marker = "";
    let lastRemoteCheck = 0;
    const run = async (force = false) => {
      if (stopped) return;
      try {
        const [file, config] = await Promise.all([
          stat(path.join(this.projectRoot, ".env.local")).catch(() => null),
          stat(path.join(this.dir, configFilename)).catch(() => null),
        ]);
        const next = `${file?.mtimeMs}:${file?.size}:${config?.mtimeMs}`;
        if (!force && next === marker && Date.now() - lastRemoteCheck < 5 * 60_000) return;
        const result = await this.sync();
        if (result.status !== "busy" && !result.failed?.length) { marker = next; lastRemoteCheck = Date.now(); }
        onResult(result);
      } catch (error) { onResult({ error: error.message }); }
    };
    const watcher = watch(this.projectRoot, { persistent: false }, (_event, filename) => {
      if (filename?.toString() !== ".env.local") return;
      clearTimeout(debounce);
      debounce = setTimeout(() => { void run(true); }, 2000);
      debounce.unref();
    });
    watcher.on("error", () => { onResult({ error: "No se pudo observar .env.local; se usará la comprobación periódica." }); });
    const interval = setInterval(() => { void run(); }, 10_000);
    interval.unref();
    void run(true);
    return () => { stopped = true; clearTimeout(debounce); clearInterval(interval); watcher.close(); };
  }
}
