import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/database.types";
import { CreditError, type CreditAccount } from "@/lib/credits/server";
import { jobKinds, type JobKind, type JobProgress, type JobRow } from "./types";

export type AdminClient = SupabaseClient<Database>;
export type Checkpoint = Record<string, unknown>;

/** The owner canceled the job: stop at once, nothing else is recorded. */
export class JobCanceled extends Error { constructor() { super("JOB_CANCELED"); } }
/** Another worker owns the job now (or the database is unreachable): stop without touching it. */
export class JobLeaseLost extends Error { constructor() { super("JOB_LEASE_LOST"); } }

export type JobContext = {
  admin: AdminClient; job: JobRow; account: CreditAccount; signal: AbortSignal;
  /** Where the previous run stopped. Recipes checkpoint BEFORE every step with effects. */
  checkpoint: Checkpoint; options: Record<string, unknown>; fileIds: string[]; note: string | null;
  /** Milliseconds left in this worker run. */
  remaining(): number;
  /** Extends the lease and saves progress/checkpoint. Throws JobCanceled or JobLeaseLost. */
  heartbeat(progress?: JobProgress, checkpoint?: Checkpoint): Promise<void>;
};
export type RecipeOutcome =
  | { kind: "done"; result: Record<string, unknown> }
  | { kind: "release"; checkpoint: Checkpoint; progress?: JobProgress };
export type Recipe = (ctx: JobContext) => Promise<RecipeOutcome>;
export type WorkerReport = { claimed: number; done: number; failed: number; released: number; canceled: number; errors: number };
type Outcome = keyof Omit<WorkerReport, "claimed">;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DB_TIMEOUT_MS = 8000;
/** With less than this left, no new job is claimed and recipes hand theirs back. */
export const MIN_ROUND_MS = 15_000;
const PUBLIC_ERROR = /^(El archivo|La extensión|Usa una|Guarda el|Formatos disponibles|No encontré|El CSV|El lector|NEXO no pudo|No reconocí|La hoja|No pude leer|Tu rol)/;
const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));

/** What the owner reads when a job fails: never provider or database details. */
export function publicJobError(error: unknown): string {
  if (error instanceof CreditError) return error.message.slice(0, 300);
  if (error instanceof Error && PUBLIC_ERROR.test(error.message)) return error.message.slice(0, 300);
  return "No pude terminar este trabajo. Inténtalo de nuevo o divide el archivo en partes más pequeñas.";
}

function claimedJob(value: unknown): JobRow | null {
  if (!record(value) || typeof value.id !== "string" || !UUID.test(value.id) || typeof value.lease_token !== "string" || !UUID.test(value.lease_token)
    || typeof value.tenant_id !== "string" || !UUID.test(value.tenant_id) || typeof value.user_id !== "string" || !UUID.test(value.user_id)
    || typeof value.session_id !== "string" || !value.session_id || !jobKinds.includes(value.kind as JobKind) || value.status !== "running") return null;
  return value as unknown as JobRow;
}

async function runOne(admin: AdminClient, job: JobRow, recipes: Partial<Record<JobKind, Recipe>>, remaining: () => number, parent?: AbortSignal): Promise<Outcome> {
  const lease = job.lease_token!;
  const guard = AbortSignal.timeout(Math.max(remaining(), 1000) + 10_000);
  const signal = parent ? AbortSignal.any([parent, guard]) : guard;
  const input = record(job.input) ? job.input : {};
  const call = (name: "nexo_job_heartbeat" | "nexo_release_job" | "nexo_finish_job", args: Record<string, unknown>) =>
    admin.rpc(name, { p_id: job.id, p_lease: lease, ...args } as never).abortSignal(AbortSignal.timeout(DB_TIMEOUT_MS));
  const ctx: JobContext = {
    admin, job, account: { tenantId: job.tenant_id, userId: job.user_id, channel: "web" }, signal,
    checkpoint: record(job.checkpoint) ? { ...job.checkpoint } : {},
    options: record(input.options) ? input.options : {},
    fileIds: Array.isArray(input.file_ids) ? input.file_ids.filter((id): id is string => typeof id === "string" && UUID.test(id)) : [],
    note: typeof input.note === "string" ? input.note : null,
    remaining,
    async heartbeat(progress, checkpoint) {
      const { data, error } = await call("nexo_job_heartbeat", { p_progress: progress ?? null, p_checkpoint: (checkpoint ?? null) as Json });
      if (error) throw new JobLeaseLost();
      const result = record(data) ? data : {};
      if (result.canceled === true) throw new JobCanceled();
      if (result.ok !== true) throw new JobLeaseLost();
      if (checkpoint) ctx.checkpoint = checkpoint;
    },
  };
  const release = async (checkpoint: Checkpoint, progress?: JobProgress): Promise<Outcome> => {
    const { data, error } = await call("nexo_release_job", { p_checkpoint: checkpoint as Json, p_progress: progress ?? null });
    if (error) return "errors";
    return record(data) && data.status === "failed" ? "failed" : record(data) && data.ok === true ? "released" : "errors";
  };
  const finish = async (status: "done" | "failed", result?: Record<string, unknown>, message?: string): Promise<Outcome> => {
    const { data, error } = await call("nexo_finish_job", { p_status: status, p_result: (result ?? null) as Json, p_error: message ?? null });
    if (error) return "errors";
    if (record(data) && data.canceled === true) return "canceled";
    return record(data) && data.ok === true ? status : "errors";
  };
  try {
    const recipe = recipes[job.kind];
    if (!recipe) return finish("failed", undefined, "Este tipo de trabajo ya no está disponible.");
    const outcome = await recipe(ctx);
    return outcome.kind === "done" ? finish("done", outcome.result) : release(outcome.checkpoint, outcome.progress);
  } catch (error) {
    if (error instanceof JobCanceled) return "canceled";
    if (error instanceof JobLeaseLost) return "errors";
    // The run was cut short (timeout or shutdown): the job goes on later from its last checkpoint.
    if (signal.aborted && !(error instanceof CreditError)) return release(ctx.checkpoint);
    return finish("failed", undefined, publicJobError(error));
  }
}

/**
 * One worker run: claims queued jobs one at a time while its time budget lasts. Each job
 * runs under a lease; a run that dies leaves a checkpoint the next run continues from.
 */
export async function runJobsWorker(admin: AdminClient, options: { recipes: Partial<Record<JobKind, Recipe>>; budgetMs?: number; now?: () => number; signal?: AbortSignal }): Promise<WorkerReport> {
  const now = options.now ?? Date.now;
  const budget = options.budgetMs ?? 45_000;
  const started = now();
  const remaining = () => budget - (now() - started);
  const report: WorkerReport = { claimed: 0, done: 0, failed: 0, released: 0, canceled: 0, errors: 0 };
  while (remaining() > MIN_ROUND_MS && !options.signal?.aborted) {
    const { data, error } = await admin.rpc("nexo_claim_jobs", { p_limit: 1 }).abortSignal(AbortSignal.timeout(DB_TIMEOUT_MS));
    if (error) { report.errors++; break; }
    const job = Array.isArray(data) && data.length ? claimedJob(data[0]) : null;
    if (!job) { if (Array.isArray(data) && data.length) report.errors++; break; }
    report.claimed++;
    report[await runOne(admin, job, options.recipes, remaining, options.signal)]++;
  }
  return report;
}
