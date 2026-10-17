"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ListChecks, Loader2, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { Panel, PanelHeader, Segmented } from "@/components/dashboard/panel";
import { useJobs } from "@/hooks/useJobs";
import { isActiveJob, type JobView } from "@/lib/jobs/types";
import { jobLabels, jobStatusLabels } from "@/lib/jobs/labels";
import { timeAgo } from "@/lib/utils";

const TONE: Record<JobView["status"], "info" | "success" | "warning" | "neutral"> = { queued: "info", running: "info", done: "success", failed: "warning", canceled: "neutral" };
export function jobProgressText(job: JobView) {
  const { done, total, step } = job.progress;
  const count = typeof done === "number" && typeof total === "number" && total > 0 ? `${done} de ${total}` : typeof done === "number" && done > 0 ? `${done}` : "";
  return [step, count].filter(Boolean).join(" · ") || (job.status === "queued" ? "En cola, empieza en menos de un minuto" : "Trabajando");
}

/** Everything NEXO did or is doing in the background for this business. */
export function JobsView({ canWrite }: { canWrite: boolean }) {
  const router = useRouter();
  const jobs = useJobs(true, { mine: false });
  const [tab, setTab] = useState<"active" | "finished">("active");
  const list = jobs.jobs.filter(job => tab === "active" ? isActiveJob(job) : !isActiveJob(job));
  return (
    <div className="mx-auto max-w-[1100px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <PageHeader title="Trabajos de NEXO" description="Tareas largas que NEXO termina en segundo plano y te avisa al acabar: importar catálogos, actualizar stock y precios desde un archivo, revisar los cobros."
        actions={<div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => void jobs.refresh()} disabled={jobs.busy !== null} aria-label="Actualizar"><RefreshCw className="size-4" /></Button>
          {canWrite && <Button size="sm" disabled={jobs.busy !== null || jobs.jobs.some(job => isActiveJob(job) && job.kind === "collections_review")} onClick={() => void jobs.start({ kind: "collections_review" })}>
            {jobs.busy === "start" ? <Loader2 className="size-4 animate-spin" /> : <ListChecks className="size-4" />}Revisar cobros ahora</Button>}
        </div>} />
      {jobs.error && <p role="alert" className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2.5 text-[13px] text-rose-800">{jobs.error}</p>}
      <Panel>
        <PanelHeader title={tab === "active" ? "En curso" : "Terminados"} description={tab === "active" ? "Se actualizan solos cada pocos segundos." : "Los últimos 20 trabajos del negocio."}
          actions={<Segmented label="Estado" value={tab} onChange={value => setTab(value as "active" | "finished")} options={[{ value: "active", label: "Activos", count: jobs.jobs.filter(isActiveJob).length }, { value: "finished", label: "Terminados" }]} />} />
        {!jobs.loaded ? <p className="px-5 py-10 text-center text-[13px] text-muted">Cargando trabajos…</p>
          : !list.length ? <EmptyState icon={ListChecks} title={tab === "active" ? "Nada en curso" : "Todavía no hay trabajos terminados"}
            description={canWrite ? "Pídele a NEXO en la burbuja: «importa este catálogo», «actualiza el stock con este archivo» o «revisa los cobros». También puedes arrastrar un archivo a la burbuja." : "Los dueños y agentes pueden iniciar trabajos desde la burbuja de NEXO."} />
          : <ul className="divide-y divide-line">
            {list.map(job => (
              <li key={job.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 sm:px-5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/dashboard/jobs/${job.id}`} className="text-[13px] font-medium text-ink underline-offset-2 hover:underline">{jobLabels[job.kind]}</Link>
                    <Badge variant={TONE[job.status]}>{jobStatusLabels[job.status]}</Badge>
                    {job.applied_at && <Badge variant="success">Importado</Badge>}
                  </div>
                  <p className="mt-0.5 text-xs leading-5 text-ink-soft">{isActiveJob(job) ? jobProgressText(job) : job.status === "done" ? job.summary ?? "Terminado" : job.status === "failed" ? job.error ?? "No terminó" : "Cancelado"}</p>
                  <p className="mt-0.5 text-[11px] text-muted">{isActiveJob(job) ? `Empezó ${timeAgo(job.started_at ?? job.created_at)}` : job.finished_at ? `${jobStatusLabels[job.status]} ${timeAgo(job.finished_at)}` : ""}{job.note ? ` · ${job.note}` : ""}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  {canWrite && isActiveJob(job) && <Button variant="secondary" size="sm" disabled={jobs.busy === job.id} onClick={() => void jobs.cancel(job.id)}>Cancelar</Button>}
                  <Button variant="secondary" size="sm" onClick={() => router.push(`/dashboard/jobs/${job.id}`)}>{job.status === "done" ? "Ver resultado" : "Ver detalle"}</Button>
                </div>
              </li>
            ))}
          </ul>}
      </Panel>
    </div>
  );
}
