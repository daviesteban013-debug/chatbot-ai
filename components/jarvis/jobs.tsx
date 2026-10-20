"use client";
import { useEffect, useState, type ClipboardEvent } from "react";
import { Check, ClipboardCopy, FolderOpen, Loader2, X } from "lucide-react";

/** Files for the next message in the bubble: drop, paste, chips and the one-click jobs they allow. */
export type BubbleAttachments = {
  selected: { id: string; name: string; status: "ready" | "needs_ocr" }[]; pending: boolean; error: string | null; canPaste: boolean;
  quickActions: { id: string; label: string; onPick(): void }[];
  onDrop(files: FileList | File[]): void; onRemove(id: string): void; onPaste(event: ClipboardEvent<HTMLInputElement>): void; onPasteButton(): void;
};
import { isActiveJob, type JobView } from "@/lib/jobs/types";
import { jobShortLabels, jobStatusLabels } from "@/lib/jobs/labels";
import type { WatchPreference } from "@/types/nexo-desktop";
import styles from "./jobs.module.css";

const ago = (iso: string | null) => {
  if (!iso) return "";
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  return !Number.isFinite(minutes) ? "" : minutes < 1 ? "ahora" : minutes < 60 ? `hace ${minutes} min` : `hace ${Math.round(minutes / 60)} h`;
};
function progressText(job: JobView) {
  const { done, total, step } = job.progress;
  const count = typeof done === "number" && typeof total === "number" && total > 0 ? `${done} de ${total}` : typeof done === "number" && done > 0 ? `${done}` : "";
  return [step, count].filter(Boolean).join(" · ") || (job.status === "queued" ? "En cola" : "Trabajando");
}

/** What Zorax is doing or finished in the background, with the one next step for each. */
export function JobCards({ jobs, busy, onOpen, onCancel, onApply, onCopy, onRetry }: {
  jobs: JobView[]; busy: string | null;
  onOpen(href: string): void; onCancel(id: string): void; onApply(id: string): void; onCopy(id: string): void; onRetry?(job: JobView): void;
}) {
  if (!jobs.length) return null;
  return <section className={styles.card} aria-label="Trabajos en segundo plano">
    <p className={styles.head}><span>TRABAJOS</span><button type="button" onClick={() => onOpen("/dashboard/jobs")}>Ver todos</button></p>
    <ul className={styles.list}>
      {jobs.map(job => {
        const active = isActiveJob(job);
        const pending = busy === job.id;
        return <li key={job.id} className={styles.item} data-status={job.status}>
          <span className={styles.dot} data-status={job.status} aria-hidden="true">{active && <Loader2 size={10} className={styles.spin} />}</span>
          <div className={styles.text}>
            <strong>{jobShortLabels[job.kind]}</strong>
            <span>{active ? progressText(job) : job.status === "done" ? job.summary ?? "Terminado" : job.status === "failed" ? job.error ?? "No terminó" : jobStatusLabels[job.status]}</span>
            <small>{active ? `Empezó ${ago(job.started_at ?? job.created_at)}` : `${jobStatusLabels[job.status]} ${ago(job.finished_at)}`}{job.applied_at ? " · productos importados" : ""}</small>
          </div>
          <div className={styles.actions}>
            {active && <button type="button" className={styles.action} disabled={pending} onClick={() => onCancel(job.id)}>Cancelar</button>}
            {job.status === "done" && job.kind === "catalog_import" && !job.applied_at && (job.counts.products ?? 0) > 0 && <>
              <button type="button" className={styles.action} onClick={() => onOpen(`/dashboard/jobs/${job.id}`)}>Revisar</button>
              <button type="button" className={styles.primary} disabled={pending} onClick={() => onApply(job.id)}>{pending ? "Importando…" : "Aplicar"}</button>
            </>}
            {job.status === "done" && job.kind === "catalog_update" && <button type="button" className={styles.action} onClick={() => onOpen(`/dashboard/jobs/${job.id}`)}>{(job.counts.pending ?? 0) > 0 ? "Ver tarjetas" : "Ver detalle"}</button>}
            {job.status === "done" && job.kind === "collections_review" && <>
              <button type="button" className={styles.action} onClick={() => onOpen(`/dashboard/jobs/${job.id}`)}>Ver informe</button>
              <button type="button" className={styles.action} disabled={pending} onClick={() => onCopy(job.id)} aria-label="Copiar informe"><ClipboardCopy size={12} /></button>
            </>}
            {job.status === "done" && job.kind === "catalog_import" && (job.applied_at || !(job.counts.products ?? 0)) && <button type="button" className={styles.action} onClick={() => onOpen(`/dashboard/jobs/${job.id}`)}>Ver detalle</button>}
            {job.status === "failed" && onRetry && job.kind === "collections_review" && <button type="button" className={styles.action} disabled={pending} onClick={() => onRetry(job)}>Reintentar</button>}
            {(job.status === "failed" || job.status === "canceled") && <button type="button" className={styles.action} onClick={() => onOpen(`/dashboard/jobs/${job.id}`)}>Ver detalle</button>}
          </div>
        </li>;
      })}
    </ul>
  </section>;
}

/** Files waiting to go with the next message, and what Zorax can do with them right away. */
export function AttachmentBar({ files, pending, error, quickActions, onRemove }: {
  files: { id: string; name: string; status: "ready" | "needs_ocr" }[]; pending: boolean; error: string | null;
  quickActions: { id: string; label: string; onPick(): void }[]; onRemove(id: string): void;
}) {
  if (!files.length && !pending && !error) return null;
  return <div className={styles.attachments}>
    {!!files.length && <div className={styles.chips}>{files.map(file => <span key={file.id} className={styles.chip} title={file.name}><span>{file.name}</span>{file.status === "needs_ocr" && <small>sin texto</small>}<button type="button" onClick={() => onRemove(file.id)} aria-label={`Quitar ${file.name}`}><X size={11} /></button></span>)}</div>}
    {pending && <p className={styles.pending}><Loader2 size={11} className={styles.spin} />Leyendo el archivo…</p>}
    {error && <p className={styles.problem} role="alert">{error}</p>}
    {!!files.length && !pending && !!quickActions.length && <div className={styles.quick}>{quickActions.map(action => <button key={action.id} type="button" onClick={action.onPick}>{action.label}</button>)}</div>}
  </div>;
}

/** Shown while a file is dragged over the bubble. */
export function DropHint() {
  return <div className={styles.drop} aria-hidden="true"><p>Suelta aquí tu archivo</p><small>PDF, Excel, CSV, Word, fotos o texto · hasta 3 MB</small></div>;
}

const ACTIONS: { value: WatchPreference["action"]; label: string }[] = [
  { value: "ask", label: "Preguntarme qué hacer" }, { value: "catalog_import", label: "Importar al catálogo" }, { value: "catalog_update", label: "Actualizar stock o precios" },
];
/** Desktop 0.2.5+: Zorax watches Descargas/Zorax and picks up what you save there. */
export function WatchFolderSettings() {
  const bridge = typeof window !== "undefined" ? window.nexoDesktop : undefined;
  const available = Boolean(bridge?.setWatch && bridge.getWatch);
  const [preference, setPreference] = useState<WatchPreference>({ enabled: false, action: "ask" });
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!available) return;
    let live = true;
    bridge!.getWatch!().then(value => { if (live) setPreference(value); }).catch(() => {});
    return () => { live = false; };
  }, [available, bridge]);
  const save = async (patch: Partial<WatchPreference>) => {
    try { setPreference(await bridge!.setWatch!({ ...preference, ...patch })); setNotice(null); }
    catch { setNotice("No se pudo guardar la carpeta vigilada."); }
  };
  return <div className={styles.watch}>
    <p>CARPETA VIGILADA</p>
    <div className={styles.box} data-disabled={!available}>
      <label className={styles.row}><span>Vigilar Descargas/Zorax<small>{available ? "Lo que guardes ahí llega a esta conversación. Subcarpetas «catalogo» y «stock» inician su trabajo solas." : "Disponible al actualizar Zorax para escritorio."}</small></span>
        <button type="button" role="switch" aria-checked={preference.enabled} aria-label="Vigilar carpeta" disabled={!available} className={styles.switch} onClick={() => void save({ enabled: !preference.enabled })} /></label>
      {available && preference.enabled && <>
        <label className={styles.row}><span>Con un archivo nuevo</span>
          <select aria-label="Acción con un archivo nuevo" value={preference.action} onChange={event => void save({ action: event.target.value as WatchPreference["action"] })}>{ACTIONS.map(action => <option key={action.value} value={action.value}>{action.label}</option>)}</select></label>
        <div className={styles.row}><button type="button" className={styles.action} onClick={() => void bridge!.openWatchFolder?.()}><FolderOpen size={12} />Abrir carpeta</button>{notice && <small>{notice}</small>}</div>
      </>}
    </div>
  </div>;
}

/** Tiny confirmation after copying a report. */
export function CopiedNotice({ visible }: { visible: boolean }) {
  return visible ? <p className={styles.copied} role="status"><Check size={11} />Informe copiado</p> : null;
}
