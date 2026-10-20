import { z } from "zod";
import type { Json } from "@/lib/database.types";

/** Long tasks Zorax runs outside the chat turn. Each kind has one recipe in lib/jobs/recipes. */
export const jobKinds = ["catalog_import", "catalog_update", "collections_review"] as const;
export type JobKind = (typeof jobKinds)[number];
export const jobStatuses = ["queued", "running", "done", "failed", "canceled"] as const;
export type JobStatus = (typeof jobStatuses)[number];
export const activeJobStatuses: readonly JobStatus[] = ["queued", "running"];

export type JobRow = {
  id: string; tenant_id: string; user_id: string; session_id: string; kind: JobKind; status: JobStatus;
  input: Json; checkpoint: Json; progress: Json; result: Json | null; error: string | null; request_key: string;
  attempts: number; rounds: number; lease_token: string | null; lease_until: string | null; canceled_by: string | null;
  created_at: string; updated_at: string; started_at: string | null; finished_at: string | null; applied_at: string | null;
};

/** Options each recipe understands. Unknown keys are rejected before the job is queued. */
export const jobOptions = {
  catalog_import: z.object({ mode: z.enum(["merge", "only_new"]).default("merge") }).strict(),
  catalog_update: z.object({ stock_mode: z.enum(["set", "add"]).default("set"), fields: z.enum(["auto", "stock", "price"]).default("auto") }).strict(),
  collections_review: z.object({}).strict(),
} as const;
export type JobOptions = { [K in JobKind]: z.infer<(typeof jobOptions)[K]> };

export const startJobInput = z.object({
  kind: z.enum(jobKinds),
  file_ids: z.array(z.string().uuid()).max(3).default([]),
  note: z.string().trim().max(500).optional(),
  options: z.record(z.string(), z.unknown()).optional(),
}).strict();
export type StartJobInput = z.infer<typeof startJobInput>;

export const jobProgress = z.object({ done: z.number().int().nonnegative(), total: z.number().int().nonnegative(), step: z.string().max(120) }).partial();
export type JobProgress = z.infer<typeof jobProgress>;

const counts = z.record(z.string(), z.number()).default({});
/** The part of a result every client needs; recipes keep richer data under their own keys. */
export const jobResultSummary = z.object({ summary: z.string().max(300).optional(), counts }).loose();

/** What the bubble, the panel and the activity feed show about a job. */
export type JobView = {
  id: string; kind: JobKind; status: JobStatus; session_id: string;
  created_at: string; started_at: string | null; finished_at: string | null; applied_at: string | null;
  progress: JobProgress; summary: string | null; error: string | null; counts: Record<string, number>; note: string | null;
};

export function jobView(row: JobRow): JobView {
  const progress = jobProgress.safeParse(row.progress);
  const result = jobResultSummary.safeParse(row.result ?? {});
  const input = row.input && typeof row.input === "object" && !Array.isArray(row.input) ? row.input as Record<string, Json | undefined> : {};
  return {
    id: row.id, kind: row.kind, status: row.status, session_id: row.session_id,
    created_at: row.created_at, started_at: row.started_at, finished_at: row.finished_at, applied_at: row.applied_at,
    progress: progress.success ? progress.data : {},
    summary: result.success ? result.data.summary ?? null : null,
    error: row.error, counts: result.success ? result.data.counts : {},
    note: typeof input.note === "string" ? input.note : null,
  };
}

export const jobViewSchema = z.object({
  id: z.string().uuid(), kind: z.enum(jobKinds), status: z.enum(jobStatuses), session_id: z.string(),
  created_at: z.string(), started_at: z.string().nullable(), finished_at: z.string().nullable(), applied_at: z.string().nullable(),
  progress: jobProgress, summary: z.string().nullable(), error: z.string().nullable(), counts: z.record(z.string(), z.number()), note: z.string().nullable(),
});

export function isActiveJob(job: Pick<JobView, "status">) { return activeJobStatuses.includes(job.status); }
