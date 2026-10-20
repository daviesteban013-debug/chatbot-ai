"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, ClipboardCopy, Download, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { PageHeader } from "@/components/dashboard/page-header";
import { Panel, PanelHeader } from "@/components/dashboard/panel";
import { isActiveJob, jobViewSchema, type JobView } from "@/lib/jobs/types";
import { collectionReasons, collectionStates, jobLabels, jobStatusLabels } from "@/lib/jobs/labels";
import type { ImportDraft } from "@/lib/jobs/recipes/catalog-import";
import type { AppliedLine, PendingProposal, SkippedRow } from "@/lib/jobs/recipes/catalog-update";
import type { CollectionCustomer } from "@/lib/jobs/recipes/collections-review";
import { formatCOP, timeAgo } from "@/lib/utils";
import { jobProgressText } from "./jobs-view";

type Detail = { job: JobView; result: Record<string, unknown> | null };
type ApplyOutcome = { created: number; updated: number; skipped: number; missing_price: number; results: { index: number; status: string; reason?: string }[] };
const REASONS: Record<string, string> = {
  exists: "ya existe (modo solo nuevos)", catalog_invalid_price: "precio inválido", catalog_invalid_name: "sin nombre",
  catalog_sku_taken: "SKU repetido", catalog_invalid_sku: "SKU inválido", catalog_stock_below_reserved: "stock menor a lo reservado",
};
const TONE: Record<JobView["status"], "info" | "success" | "warning" | "neutral"> = { queued: "info", running: "info", done: "success", failed: "warning", canceled: "neutral" };
const array = <T,>(value: unknown): T[] => Array.isArray(value) ? value as T[] : [];

async function post(url: string, payload: unknown) {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(30000) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? "No pude completar la acción.");
  return body;
}

/** One job: its progress while it runs, and what it left when it finished. */
export function JobDetail({ id, canWrite }: { id: string; canWrite: boolean }) {
  const router = useRouter();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const load = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch(`/api/jarvis/jobs/${id}`, { cache: "no-store", signal });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error ?? "No pude cargar el trabajo.");
    const job = jobViewSchema.safeParse(body.job);
    if (!job.success) throw new Error("No pude leer el trabajo.");
    if (!signal?.aborted) { setDetail({ job: job.data, result: body.result && typeof body.result === "object" ? body.result as Record<string, unknown> : null }); setError(null); }
  }, [id]);
  const active = detail ? isActiveJob(detail.job) : true;
  useEffect(() => {
    const controller = new AbortController();
    const start = () => load(controller.signal).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "No pude cargar el trabajo."); });
    void start();
    const poll = active ? setInterval(start, 5000) : null;
    return () => { controller.abort(); if (poll) clearInterval(poll); };
  }, [load, active]);
  const act = async (payload: unknown, done?: string) => {
    setBusy(true); setError(null); setNotice(null);
    try { const body = await post(`/api/jarvis/jobs/${id}`, payload); await load(); if (done) setNotice(done); router.refresh(); return body; }
    catch (cause) { setError(cause instanceof Error ? cause.message : "No pude completar la acción."); return null; }
    finally { setBusy(false); }
  };

  if (!detail && !error) return <div className="px-6 py-16 text-center text-[13px] text-muted">Cargando trabajo…</div>;
  if (!detail) return <div className="mx-auto max-w-[1100px] px-4 py-6 sm:px-6 lg:px-8"><PageHeader title="Trabajo" backHref="/dashboard/jobs" /><p role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2.5 text-[13px] text-rose-800">{error}</p></div>;
  const { job, result } = detail;
  return (
    <div className="mx-auto max-w-[1100px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <PageHeader title={jobLabels[job.kind]} backHref="/dashboard/jobs"
        description={isActiveJob(job) ? jobProgressText(job) : job.status === "done" ? job.summary ?? "Terminado" : job.status === "failed" ? job.error ?? "No terminó" : "Cancelado antes de terminar"}
        actions={<div className="flex items-center gap-2"><Badge variant={TONE[job.status]}>{jobStatusLabels[job.status]}</Badge>
          {canWrite && isActiveJob(job) && <Button variant="secondary" size="sm" disabled={busy} onClick={() => void act({ action: "cancel" }, "Trabajo cancelado.")}>Cancelar</Button>}</div>} />
      <p className="mb-4 text-xs text-muted">Creado {timeAgo(job.created_at)}{job.finished_at ? ` · ${jobStatusLabels[job.status].toLowerCase()} ${timeAgo(job.finished_at)}` : ""}{job.note ? ` · ${job.note}` : ""}</p>
      {error && <p role="alert" className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2.5 text-[13px] text-rose-800">{error}</p>}
      {notice && <p role="status" className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[13px] text-emerald-800">{notice}</p>}
      {isActiveJob(job) && <Panel><p className="flex items-center gap-2 px-5 py-8 text-[13px] text-ink-soft"><Loader2 className="size-4 animate-spin" />Zorax sigue trabajando. Esta página se actualiza sola.</p></Panel>}
      {job.status === "done" && result && job.kind === "catalog_import" && <ImportResult job={job} result={result} canWrite={canWrite} busy={busy} onApply={(mode, selected) => act({ action: "apply", mode, selected }, "Productos importados.")} />}
      {job.status === "done" && result && job.kind === "catalog_update" && <UpdateResult result={result} canWrite={canWrite} onChanged={() => void load()} />}
      {job.status === "done" && result && job.kind === "collections_review" && <CollectionsResult result={result} />}
      {job.status === "failed" && <Panel><div className="px-5 py-6 text-[13px] text-ink-soft"><p className="flex items-center gap-2 font-medium text-ink"><AlertTriangle className="size-4 text-amber-600" />{job.error ?? "No terminó"}</p><p className="mt-2 text-muted">Pídele a Zorax que lo intente de nuevo{job.kind !== "collections_review" ? " con el archivo adjunto en la conversación" : ""}.</p></div></Panel>}
    </div>
  );
}

function ImportResult({ job, result, canWrite, busy, onApply }: { job: JobView; result: Record<string, unknown>; canWrite: boolean; busy: boolean; onApply(mode: "merge" | "only_new", selected: number[]): Promise<unknown> }) {
  const drafts = array<ImportDraft>(result.drafts);
  const warnings = array<string>(result.warnings);
  const applied = result.applied && typeof result.applied === "object" ? result.applied as ApplyOutcome : null;
  const [mode, setMode] = useState<"merge" | "only_new">(result.mode === "only_new" ? "only_new" : "merge");
  const [selected, setSelected] = useState<Set<number>>(() => new Set(drafts.map((draft, index) => draft.price_retail === null ? -1 : index).filter(index => index >= 0)));
  const toggle = (index: number) => setSelected(current => { const next = new Set(current); if (next.has(index)) next.delete(index); else next.add(index); return next; });
  const missing = drafts.filter(draft => draft.price_retail === null).length;
  return <Panel>
    <PanelHeader title={`${drafts.length} productos encontrados`} description={applied ? `Importados ${job.applied_at ? timeAgo(job.applied_at) : ""}: ${applied.created} creados · ${applied.updated} actualizados · ${applied.skipped} omitidos.` : "Revisa la lista y elige qué importar. Nada se guarda hasta que confirmes."}
      actions={!applied && canWrite && drafts.length > 0 ? <div className="flex flex-wrap items-center gap-2">
        <Select value={mode} onChange={event => setMode(event.target.value as typeof mode)} aria-label="Qué hacer con productos que ya existen" className="h-9 py-0 text-[13px]"><option value="merge">Crear nuevos y actualizar existentes</option><option value="only_new">Solo crear nuevos</option></Select>
        <Button size="sm" disabled={busy || !selected.size} onClick={() => void onApply(mode, [...selected].sort((a, b) => a - b))}><CheckCircle2 className="size-4" />Importar {selected.size}</Button>
      </div> : null} />
    {warnings.map(warning => <p key={warning} className="mx-4 mt-3 flex gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 sm:mx-5"><AlertTriangle className="size-4 shrink-0" />{warning}</p>)}
    {missing > 0 && !applied && <p className="mx-4 mt-3 rounded-md border border-line bg-subtle px-3 py-2 text-xs text-ink-soft sm:mx-5">{missing} producto{missing === 1 ? "" : "s"} sin precio quedan sin marcar: complétalos después en Catálogo o pídele a Zorax que relea el archivo.</p>}
    <ul className="mt-2 divide-y divide-line">
      {drafts.map((draft, index) => {
        const outcome = applied?.results.find(item => item.index === index);
        return <li key={index} className="flex items-start gap-3 px-4 py-3 sm:px-5">
          {!applied && <input type="checkbox" checked={selected.has(index)} disabled={!canWrite || draft.price_retail === null} onChange={() => toggle(index)} aria-label={`Incluir ${draft.name}`} className="mt-1 size-4 rounded border-line-strong accent-ink" />}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 text-[13px]"><span className="font-medium text-ink">{draft.name}</span>{draft.sku && <span className="font-mono text-xs text-muted">{draft.sku}</span>}
              <Badge variant={draft.existingId ? "info" : "success"}>{draft.existingId ? "Actualiza existente" : "Nuevo"}</Badge>
              {outcome && <Badge variant={outcome.status === "skipped" ? "warning" : "success"}>{outcome.status === "created" ? "Creado" : outcome.status === "updated" ? "Actualizado" : `Omitido: ${REASONS[outcome.reason ?? ""] ?? "no se pudo importar"}`}</Badge>}
              {applied && !outcome && <Badge variant="neutral">No seleccionado</Badge>}</div>
            <p className="mt-0.5 text-xs text-ink-soft">{draft.price_retail === null ? <span className="text-amber-800">Sin precio</span> : formatCOP(draft.price_retail)}{draft.category ? ` · ${draft.category}` : ""}{draft.variants.length ? ` · ${draft.variants.map(v => `${[v.color, v.size].filter(Boolean).join("/") || "stock"} ${v.stock_qty ?? 0}`).join(", ")}` : ""}</p>
            {draft.warnings.filter(w => w !== "Falta el precio").map(w => <p key={w} className="text-xs text-amber-800">· {w}</p>)}
          </div>
        </li>;
      })}
    </ul>
  </Panel>;
}

function UpdateResult({ result, canWrite, onChanged }: { result: Record<string, unknown>; canWrite: boolean; onChanged(): void }) {
  const applied = array<AppliedLine>(result.applied), pending = array<PendingProposal>(result.pending), skipped = array<SkippedRow>(result.skipped), warnings = array<string>(result.warnings);
  const counts = result.counts && typeof result.counts === "object" ? result.counts as Record<string, number> : {};
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [decided, setDecided] = useState<Record<string, string>>({});
  const decide = async (proposal: PendingProposal, decision: "confirm" | "cancel") => {
    setBusy(proposal.id); setError(null);
    try { await post("/api/jarvis/catalog-proposals", { id: proposal.id, decision }); setDecided(map => ({ ...map, [proposal.id]: decision })); onChanged(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "No pude guardar la decisión."); }
    finally { setBusy(null); }
  };
  return <div className="space-y-5">
    {warnings.map(warning => <p key={warning} className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"><AlertTriangle className="size-4 shrink-0" />{warning}</p>)}
    {pending.length > 0 && <Panel>
      <PanelHeader title={`${counts.pending ?? 0} cambios esperan tu confirmación`} description="Tarjetas que Zorax preparó; valen 24 horas. Cada una se aplica solo si nada cambió desde que se preparó." />
      {error && <p role="alert" className="mx-5 mt-3 text-xs text-rose-700">{error}</p>}
      <ul className="divide-y divide-line">{pending.map(proposal => <li key={proposal.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-[13px] sm:px-5">
        <span className="text-ink">{proposal.title} · {proposal.lines} {proposal.lines === 1 ? "producto" : "productos"}<span className="ml-2 text-xs text-muted">vence {timeAgo(proposal.expires_at).replace("hace", "en")}</span></span>
        {decided[proposal.id] ? <Badge variant={decided[proposal.id] === "confirm" ? "success" : "neutral"}>{decided[proposal.id] === "confirm" ? "Aplicado" : "Cancelado"}</Badge>
          : canWrite && <div className="flex gap-2"><Button size="sm" disabled={busy === proposal.id} onClick={() => void decide(proposal, "confirm")}>Confirmar</Button><Button variant="secondary" size="sm" disabled={busy === proposal.id} onClick={() => void decide(proposal, "cancel")}>Cancelar</Button></div>}
      </li>)}</ul>
    </Panel>}
    <Panel>
      <PanelHeader title={`${applied.length} cambios aplicados`} description={applied.length ? "Aplicados por Zorax con la autonomía que activó el dueño; cada uno se puede deshacer 7 días desde «Lo que hizo Zorax»." : "Zorax no aplicó cambios por su cuenta en este archivo."} />
      {applied.length > 0 && <table className="w-full text-[13px]"><thead><tr className="text-left text-[11px] uppercase tracking-wide text-muted"><th className="px-5 py-2 font-medium">Producto</th><th className="px-2 py-2 font-medium">SKU</th><th className="px-2 py-2 text-right font-medium">Antes</th><th className="px-5 py-2 text-right font-medium">Después</th></tr></thead>
        <tbody className="divide-y divide-line">{applied.map((line, index) => <tr key={`${line.sku}-${index}`}><td className="px-5 py-2 text-ink">{line.label}</td><td className="px-2 py-2 font-mono text-xs text-muted">{line.sku}</td><td className="px-2 py-2 text-right tabular-nums text-ink-soft">{line.kind === "price" ? formatCOP(line.before) : line.before}</td><td className="px-5 py-2 text-right tabular-nums text-ink">{line.kind === "price" ? formatCOP(line.after) : line.after}</td></tr>)}</tbody></table>}
    </Panel>
    {(skipped.length > 0 || (counts.pending_later ?? 0) > 0) && <Panel>
      <PanelHeader title={`${skipped.length} filas omitidas`} description={(counts.pending_later ?? 0) > 0 ? `Además, ${counts.pending_later} filas quedaron para después porque había demasiadas tarjetas pendientes: confirma o cancela las tarjetas y pídele a Zorax que repita el archivo.` : "Revisa estas filas en el archivo y vuelve a intentarlo si hace falta."} />
      <ul className="divide-y divide-line text-[13px]">{skipped.map((row, index) => <li key={index} className="flex flex-wrap gap-2 px-4 py-2 sm:px-5"><span className="w-16 text-muted">Fila {row.row}</span>{row.sku && <span className="font-mono text-xs text-ink-soft">{row.sku}</span>}<span className="text-ink-soft">{row.reason}</span></li>)}</ul>
    </Panel>}
  </div>;
}

function CollectionsResult({ result }: { result: Record<string, unknown> }) {
  const customers = array<CollectionCustomer>(result.customers);
  const counts = result.counts && typeof result.counts === "object" ? result.counts as Record<string, number> : {};
  const csv = typeof result.csv === "string" ? result.csv : "";
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const copy = async () => { try { await navigator.clipboard.writeText(csv); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* Clipboard blocked: download still works. */ } };
  const download = () => { const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); const link = document.createElement("a"); link.href = url; link.download = "cobros-nexo.csv"; link.click(); URL.revokeObjectURL(url); };
  return <Panel>
    <PanelHeader title={`${counts.orders ?? 0} pedidos por cobrar · ${formatCOP(counts.total ?? 0)}`}
      description={`${counts.scheduled ?? 0} con recordatorio en cola · ${counts.reminded ?? 0} ya recordados · ${counts.requires_call ?? 0} requieren tu llamada. Zorax solo recuerda pagos por WhatsApp cuando el pedido se confirmó por ese canal y los recordatorios están activos.`}
      actions={csv ? <div className="flex gap-2"><Button variant="secondary" size="sm" onClick={() => void copy()}><ClipboardCopy className="size-4" />{copied ? "Copiado" : "Copiar informe"}</Button><Button variant="secondary" size="sm" onClick={download}><Download className="size-4" />CSV</Button></div> : null} />
    {result.csv_truncated === true && <p className="mx-5 mt-3 text-xs text-muted">El CSV incluye solo los primeros pedidos (64 KB).</p>}
    <ul className="divide-y divide-line">
      {customers.map(customer => <li key={customer.id} className="px-4 py-3 sm:px-5">
        <button type="button" className="flex w-full flex-wrap items-center justify-between gap-2 text-left" onClick={() => setOpen(current => current === customer.id ? null : customer.id)} aria-expanded={open === customer.id}>
          <span className="text-[13px] font-medium text-ink">{customer.name ?? customer.phone}<span className="ml-2 text-xs font-normal text-muted">{customer.phone}</span></span>
          <span className="flex items-center gap-2 text-[13px] tabular-nums text-ink">{formatCOP(customer.total)}<span className="text-xs text-muted">{customer.orders.length} {customer.orders.length === 1 ? "pedido" : "pedidos"}</span>
            {customer.orders.some(order => order.state === "requires_call") && <Badge variant="warning">Requiere llamada</Badge>}</span>
        </button>
        {open === customer.id && <ul className="mt-2 space-y-1 border-t border-line pt-2 text-xs text-ink-soft">{customer.orders.map(order => <li key={order.id} className="flex flex-wrap items-center gap-2">
          <a href={`/dashboard/orders/${order.id}`} className="font-mono text-[11px] underline-offset-2 hover:underline">{order.id.slice(0, 8)}</a><span className="tabular-nums">{formatCOP(order.total)}</span><span className="text-muted">{order.created_at.slice(0, 10)}</span>
          <Badge variant={order.state === "requires_call" ? "warning" : order.state === "reminded" ? "success" : "info"}>{collectionStates[order.state] ?? order.state}</Badge>
          {order.reason && <span className="text-muted">{collectionReasons[order.reason] ?? order.reason}</span>}</li>)}</ul>}
      </li>)}
    </ul>
    {!customers.length && <p className="px-5 py-8 text-center text-[13px] text-muted">No hay pedidos por cobrar ahora mismo.</p>}
  </Panel>;
}
