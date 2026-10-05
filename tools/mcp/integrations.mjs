import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { access, readFile } from "node:fs/promises";
import path from "node:path";

const exec = promisify(execFile);
async function jsonCommand(command, args, cwd) {
  try {
    const { stdout } = await exec(command, args, { cwd, timeout: 30_000, maxBuffer: 2_000_000, windowsHide: true });
    return JSON.parse(stdout);
  } catch {
    throw new Error(`No se pudo consultar ${command === "gh" ? "GitHub; comprueba gh auth status" : "Vercel; comprueba vercel whoami y la conexión"}.`);
  }
}

export async function githubStatus(projectRoot) {
  const repoInfo = await jsonCommand("gh", ["repo", "view", "--json", "nameWithOwner,defaultBranchRef,url"], projectRoot);
  const repo = repoInfo.nameWithOwner;
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error("Repositorio GitHub inválido.");
  const branch = repoInfo.defaultBranchRef.name;
  const api = (endpoint) => jsonCommand("gh", ["api", `repos/${repo}/${endpoint}`, "--method", "GET"], projectRoot);
  const commit = await api(`commits/${encodeURIComponent(branch)}`);
  const [statuses, checks, pulls, runs] = await Promise.all([
    api(`commits/${commit.sha}/status`), api(`commits/${commit.sha}/check-runs?per_page=30`),
    api("pulls?state=open&per_page=10"), api(`actions/runs?branch=${encodeURIComponent(branch)}&per_page=5`),
  ]);
  return {
    repo, branch, url: repoInfo.url, sha: commit.sha,
    commit_url: commit.html_url,
    // Empty checks are reported explicitly; they do not imply successful CI.
    status: statuses.state, status_count: statuses.total_count,
    checks: checks.check_runs.map((check) => ({ name: check.name, status: check.status, conclusion: check.conclusion, url: check.html_url })),
    pull_requests: pulls.map((pr) => ({ number: pr.number, title: pr.title, draft: pr.draft, branch: pr.head.ref, sha: pr.head.sha, url: pr.html_url })),
    workflow_runs: runs.workflow_runs.map((run) => ({ id: run.id, workflow_id: run.workflow_id, name: run.name, status: run.status, conclusion: run.conclusion, sha: run.head_sha, url: run.html_url })),
  };
}

export async function vercelCommand() {
  if (process.env.MCP_VERCEL_CLI) return { command: process.execPath, prefix: [process.env.MCP_VERCEL_CLI] };
  if (process.platform !== "win32") return { command: "vercel", prefix: [] };
  // Run the CLI's JS entry directly so no shell or .cmd quoting is needed.
  for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
    const entry = path.join(dir, "node_modules", "vercel", "dist", "vc.js");
    try { await access(entry); return { command: process.execPath, prefix: [entry] }; } catch { /* Try the next PATH entry. */ }
  }
  throw new Error("No se encontró Vercel CLI. Instálalo con npm install -g vercel e inicia sesión con vercel login.");
}

/** Private JSON payloads travel over stdin, never via command arguments or files. */
export async function vercelApi(projectRoot, endpoint, method = "GET", body) {
  const { command, prefix } = await vercelCommand();
  const args = [...prefix, "api", endpoint, "--method", method, "--non-interactive", "--raw"];
  if (body !== undefined) args.push("--input", "-");
  return new Promise((resolve, reject) => {
    const child = execFile(command, args, { cwd: projectRoot, timeout: 30_000, maxBuffer: 2_000_000, windowsHide: true }, (error, stdout) => {
      // Discard raw CLI errors and responses: either can contain variable values.
      if (error) { reject(new Error("No se pudo completar la operación de variables en Vercel.")); return; }
      try { resolve(JSON.parse(stdout)); } catch { reject(new Error("Vercel devolvió una respuesta de variables inválida.")); }
    });
    child.stdin.on("error", () => { /* The callback reports process failures without its private payload. */ });
    child.stdin.end(body === undefined ? undefined : JSON.stringify(body));
  });
}

export async function deploymentStatus(projectRoot, target = "production") {
  let project;
  try { project = JSON.parse(await readFile(path.join(projectRoot, ".vercel", "project.json"), "utf8")); } catch {
    throw new Error("El proyecto no está vinculado a Vercel. Ejecuta vercel link desde esta carpeta.");
  }
  if (!project.projectId || !project.orgId) throw new Error("La vinculación de Vercel está incompleta.");
  const { command, prefix } = await vercelCommand();
  const query = new URLSearchParams({ projectId: project.projectId, teamId: project.orgId, limit: "5", ...(target === "all" ? {} : { target }) });
  const response = await jsonCommand(command, [...prefix, "api", `/v7/deployments?${query}`, "--method", "GET", "--non-interactive", "--raw"], projectRoot);
  return {
    project: project.projectName, target,
    deployments: response.deployments.map((deployment) => ({
      id: deployment.uid, state: deployment.readyState ?? deployment.state,
      target: deployment.target, created_at: deployment.createdAt ?? deployment.created,
      sha: deployment.meta?.githubCommitSha ?? null, branch: deployment.meta?.githubCommitRef ?? null,
      url: deployment.url ? `https://${deployment.url}` : null,
      dashboard_url: deployment.inspectorUrl ?? null,
      error: deployment.errorMessage ?? null,
    })),
  };
}

export async function deliveryStatus(projectRoot) {
  const [github, vercel] = await Promise.allSettled([githubStatus(projectRoot), deploymentStatus(projectRoot)]);
  return assessDelivery(github, vercel);
}

export function assessDelivery(github, vercel) {
  const result = { checked_at: new Date().toISOString(), alerts: [] };
  for (const [key, outcome] of [["github", github], ["vercel", vercel]]) {
    result[key] = outcome.status === "fulfilled" ? outcome.value : { error: outcome.reason.message };
    if (outcome.status === "rejected") result.alerts.push(`No se pudo consultar ${key}.`);
  }
  if (github.status === "fulfilled") {
    const data = github.value;
    if (["failure", "error"].includes(data.status)) result.alerts.push("El commit actual tiene estados de GitHub fallidos.");
    if (data.checks.some((check) => ["failure", "timed_out", "action_required"].includes(check.conclusion))) result.alerts.push("Hay comprobaciones fallidas en el commit actual.");
    // A successful rerun supersedes an older failure for the same workflow/commit.
    const latestRuns = new Map();
    for (const run of data.workflow_runs) {
      const key = run.workflow_id ?? run.name;
      if (run.sha === data.sha && !latestRuns.has(key)) latestRuns.set(key, run);
    }
    if ([...latestRuns.values()].some((run) => ["failure", "timed_out", "action_required"].includes(run.conclusion))) result.alerts.push("Hay ejecuciones de CI fallidas en el commit actual.");
  }
  if (vercel.status === "fulfilled") {
    const latest = vercel.value.deployments[0];
    if (latest?.state === "ERROR") result.alerts.push("El último despliegue de producción falló.");
    if (latest?.state === "CANCELED") result.alerts.push("El último despliegue de producción fue cancelado.");
    if (github.status === "fulfilled" && latest?.sha && latest.sha !== github.value.sha) result.alerts.push("Producción todavía no corresponde al último commit de la rama principal.");
  }
  return result;
}
