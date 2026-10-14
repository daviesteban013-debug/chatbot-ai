"use client";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Inbox, RefreshCw, Plus, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { Panel, PanelHeader, Segmented } from "@/components/dashboard/panel";
import { workDate, type WorkItem } from "@/lib/workspace";

type Tab = "task" | "memory" | "proposed" | "history";
type View = { items: WorkItem[]; total: number; customers: { id: string; name: string | null; phone: string }[]; members: { user_id: string; role: string }[]; reminders: { item_id: string; due_at: string }[]; userId: string; canWrite: boolean; tenantName: string };
const tabs: { key: Tab; label: string }[] = [{ key: "task", label: "Tareas" }, { key: "memory", label: "Memoria" }, { key: "proposed", label: "Por confirmar" }, { key: "history", label: "Historial" }];
function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <label className="block"><span className="text-xs font-medium text-ink-soft">{label}</span><div className="mt-1.5">{children}</div>{hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}</label>;
}
function localDate(value: string) { const d = new Date(value); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; }

export function WorkspaceView() {
  const [tab, setTab] = useState<Tab>("task"), [page, setPage] = useState(0), [view, setView] = useState<View | null>(null);
  const [error, setError] = useState(""), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [form, setForm] = useState(false);
  const [editing, setEditing] = useState<WorkItem | null>(null), [kind, setKind] = useState<"task" | "memory">("task");
  const [title, setTitle] = useState(""), [body, setBody] = useState(""), [customer, setCustomer] = useState(""), [assignee, setAssignee] = useState(""), [due, setDue] = useState(""), [zone, setZone] = useState("America/Bogota");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const requestKey = useRef<string>("");
  const generation = useRef(0);
  const loadView = useCallback(async (): Promise<View> => {
    const response = await fetch(`/api/workspace?tab=${tab}&page=${page}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "No pude cargar la sección.");
    return data;
  }, [tab, page]);
  const refresh = useCallback(async () => {
    const current = ++generation.current;
    setLoading(true);
    try {
      const data = await loadView();
      if (generation.current === current) { setView(data); setError(""); setNow(Date.now()); }
    } catch (e) { if (generation.current === current) { setView(null); setError(e instanceof Error ? e.message : "No pude actualizar."); } }
    finally { if (generation.current === current) setLoading(false); }
  }, [loadView]);
  useEffect(() => {
    const requestGeneration = generation, current = ++requestGeneration.current;
    let live = true;
    void loadView().then(data => {
      if (live && requestGeneration.current === current) { setView(data); setError(""); setNow(Date.now()); }
    }).catch(e => {
      if (live && requestGeneration.current === current) { setView(null); setError(e instanceof Error ? e.message : "No pude actualizar."); }
    }).finally(() => { if (live && requestGeneration.current === current) setLoading(false); });
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 60000);
    return () => { live = false; requestGeneration.current++; window.clearInterval(timer); };
  }, [loadView, refresh]);
  function openForm(item?: WorkItem) {
    setEditing(item ?? null); setKind(item?.kind ?? (tab === "memory" ? "memory" : "task")); setTitle(item?.title ?? ""); setBody(item?.body ?? "");
    setCustomer(item?.customer_id ?? ""); setAssignee(item?.assignee_id ?? ""); setDue(item?.due_at ? localDate(item.due_at) : "");
    setZone(Intl.DateTimeFormat().resolvedOptions().timeZone); requestKey.current = crypto.randomUUID(); setForm(true); setError("");
  }
  async function mutate(payload: unknown, method = "PATCH") {
    const response = await fetch("/api/workspace", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "No pude guardar la acción.");
    return data;
  }
  async function decide(item: WorkItem, action: string) {
    setBusy(true); setError("");
    try { await mutate({ id: item.id, revision: item.revision, action }); setDeleteId(null); await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "No pude guardar."); }
    finally { setBusy(false); }
  }
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const dateFields = kind === "task" ? { due_at: new Date(due).toISOString(), timezone: zone, ...(editing ? { assignee_id: assignee || view?.userId } : {}) } : {};
      if (editing) await mutate({ id: editing.id, revision: editing.revision, action: "edit", patch: { title, body, ...dateFields } });
      else await mutate({ requestKey: requestKey.current, input: { kind, title, body, ...dateFields, ...(customer ? { customer_id: customer } : {}), ...(kind === "task" && assignee ? { assignee_id: assignee } : {}) } }, "POST");
      setForm(false); if (!editing) { setTab("proposed"); setPage(0); } await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Comprueba la fecha."); }
    finally { setBusy(false); }
  }
  return <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
    <PageHeader title="Memoria y tareas" description="Recuerdos del negocio y de tus clientes, y tareas con fecha para tu equipo."
      actions={<><Button variant="secondary" size="sm" className="w-8 px-0" onClick={() => void refresh()} disabled={loading || busy} aria-label="Actualizar"><RefreshCw className="size-4" /></Button>{view?.canWrite && <Button size="sm" onClick={() => openForm()} disabled={busy}><Plus className="size-4" />Crear</Button>}</>} />
    <div className="grid gap-5 xl:grid-cols-[1fr_300px] xl:items-start">
      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Segmented label="Vistas de memoria y tareas" value={tab} options={tabs.map(t => ({ value: t.key, label: t.label }))}
            onChange={value => { setTab(value as Tab); setPage(0); setForm(false); setView(null); setLoading(true); }} />
          <Link href="/dashboard/jarvis" className="inline-flex items-center gap-1 text-xs font-medium text-muted transition hover:text-ink">Pídeselo a NEXO <ArrowUpRight className="size-3.5" /></Link>
        </div>
        {error && <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-800">{error}</p>}
        {form && <Panel>
          <PanelHeader title={editing ? "Corregir" : "Preparar propuesta"} />
          <form onSubmit={save} className="space-y-4 px-4 py-4 sm:px-5">
            {!editing && <Field label="Tipo"><Select value={kind} onChange={e => setKind(e.target.value as "task" | "memory")}><option value="task">Tarea con recordatorio</option><option value="memory">Recuerdo del negocio o cliente</option></Select></Field>}
            <Field label="Título"><Input required maxLength={160} value={title} onChange={e => setTitle(e.target.value)} placeholder={kind === "task" ? "Revisar el pedido de Ana" : "Preferencia de entrega de Ana"} /></Field>
            <Field label={kind === "memory" ? "Hecho y contexto que quieres recordar" : "Detalles"}><Textarea rows={3} maxLength={4000} value={body} onChange={e => setBody(e.target.value)} /></Field>
            {!editing && <Field label="Cliente (opcional)" hint="Hasta 100 clientes; NEXO puede buscar otros por nombre."><Select value={customer} onChange={e => setCustomer(e.target.value)}><option value="">Todo el negocio</option>{view?.customers.map(c => <option key={c.id} value={c.id}>{c.name || "Sin nombre"} · {c.phone}</option>)}</Select></Field>}
            {kind === "task" && <div className="grid gap-4 sm:grid-cols-2"><Field label="Fecha y hora" hint={`Hora de este dispositivo · ${zone}`}><Input required type="datetime-local" value={due} onChange={e => setDue(e.target.value)} className="tabular-nums" /></Field><Field label="Responsable"><Select value={assignee} onChange={e => setAssignee(e.target.value)}><option value="">Yo</option>{view?.members.filter(m => m.user_id !== view.userId).map(m => <option key={m.user_id} value={m.user_id}>Miembro {m.user_id.slice(0, 8)} · {m.role}</option>)}</Select></Field></div>}
            <p className="text-xs leading-5 text-muted">{editing ? "Guardar corrige el registro activo y deja constancia del cambio." : "Revisa la propuesta y pulsa Confirmar en el siguiente paso. Todavía no se activará."}</p>
            <div className="flex gap-2"><Button type="submit" size="sm" disabled={busy}>{busy ? "Guardando…" : editing ? "Guardar corrección" : "Revisar propuesta"}</Button><Button type="button" variant="secondary" size="sm" onClick={() => setForm(false)} disabled={busy}>Cerrar</Button></div>
          </form>
        </Panel>}
        {loading && <p role="status" className="text-[13px] text-muted">Actualizando…</p>}
        {!loading && view && !view.items.length && <EmptyState icon={Inbox} title={tab === "proposed" ? "No tienes propuestas pendientes" : "Todavía no hay registros aquí"} description="Prueba: «NEXO, recuérdame revisar el pedido mañana a las 9, hora de Bogotá»." />}
        {view && view.items.length > 0 && <Panel as="div" className="divide-y divide-line">{view.items.map(item => {
          const overdue = item.kind === "task" && item.status === "active" && Date.parse(item.due_at!) <= now;
          const reminder = view.reminders.some(r => r.item_id === item.id && Date.parse(r.due_at) === Date.parse(item.due_at ?? ""));
          const customerName = view.customers.find(c => c.id === item.customer_id)?.name;
          return <article key={item.id} className="space-y-2.5 px-4 py-3.5 sm:px-5">
            <div className="flex items-center justify-between gap-2"><span className="text-[11px] font-medium text-muted">{item.kind === "memory" ? "Memoria" : "Tarea"}{item.customer_id ? ` · ${customerName || "Cliente vinculado"}` : " · Negocio"}</span><Badge variant={overdue ? "warning" : item.status === "proposed" ? "info" : item.status === "done" ? "success" : "neutral"}>{({ proposed: "Por confirmar", active: overdue ? "Vencida" : "Activa", done: "Completada", canceled: "Cancelada" })[item.status]}</Badge></div>
            <div><h2 className="text-[13px] font-semibold text-ink">{item.title}</h2>{item.body && <p className="mt-1 whitespace-pre-wrap break-words text-[13px] leading-6 text-ink-soft">{item.body}</p>}</div>
            {item.due_at && <div className="rounded-md border border-line bg-subtle px-3 py-2"><p className="text-[13px] font-medium tabular-nums text-ink">{workDate(item.due_at, item.timezone)}</p><p className="mt-0.5 text-xs text-muted">{item.timezone} · {item.assignee_id === view.userId ? "Asignada a ti" : `Responsable ${item.assignee_id?.slice(0, 8) ?? "creador"}`}</p>{overdue && <p className="mt-1.5 text-xs font-medium text-amber-800">{reminder ? "Recordatorio disponible para ti" : "Vencimiento registrado · aviso interno en proceso o asignado a otro miembro"}</p>}</div>}
            <p className="text-[11px] leading-5 text-muted">{item.source_session ? "Origen: propuesta de conversación con NEXO" : "Origen: registro manual del CRM"}<br/>{item.confirmed_by ? `Confirmado por ${item.confirmed_by === view.userId ? "ti" : `miembro ${item.confirmed_by.slice(0, 8)}`}` : "Pendiente de revisión humana"} · {workDate(item.updated_at, "America/Bogota")} · versión {item.revision}</p>
            {view.canWrite && <div className="flex flex-wrap gap-2 pt-0.5">{item.status === "proposed" && <><Button size="sm" disabled={busy} onClick={() => void decide(item, "confirm")}><Check className="size-3.5" /> Confirmar</Button><Button variant="secondary" size="sm" disabled={busy} onClick={() => void decide(item, "cancel")}>Cancelar</Button></>}{item.status === "active" && <>{item.kind === "task" && <Button variant="secondary" size="sm" disabled={busy} onClick={() => void decide(item, "complete")}><Check className="size-3.5" /> Completar</Button>}<Button variant="secondary" size="sm" disabled={busy} onClick={() => openForm(item)}>Corregir{item.kind === "task" ? " / reprogramar" : ""}</Button>{item.kind === "task" && <Button variant="secondary" size="sm" disabled={busy} onClick={() => void decide(item, "cancel")}>Cancelar</Button>}</>}{deleteId === item.id ? <><Button variant="secondary" size="sm" className="text-rose-700 hover:bg-rose-50" disabled={busy} onClick={() => void decide(item, "delete")}>Confirmar borrado</Button><Button variant="secondary" size="sm" disabled={busy} onClick={() => setDeleteId(null)}>Conservar</Button></> : <Button variant="ghost" size="sm" className="text-muted hover:text-ink" disabled={busy} onClick={() => setDeleteId(item.id)}>Borrar</Button>}</div>}
            {item.status === "proposed" && <p className="text-[11px] text-muted">Vence {workDate(item.expires_at, "America/Bogota")}. Al confirmar, será compartido con los miembros del negocio.</p>}
          </article>;
        })}</Panel>}
        {!!view?.total && <div className="flex items-center justify-between text-xs text-muted"><p className="tabular-nums">{page * 30 + 1}–{Math.min((page + 1) * 30, view.total)} de {view.total}</p><div className="flex gap-2"><Button variant="secondary" size="sm" disabled={!page || loading} onClick={() => setPage(page - 1)}>Anterior</Button><Button variant="secondary" size="sm" disabled={(page + 1) * 30 >= view.total || loading} onClick={() => setPage(page + 1)}>Siguiente</Button></div></div>}
      </div>
      <Panel as="aside" className="divide-y divide-line">
        <div className="px-4 py-3 sm:px-5"><h2 className="text-xs font-medium text-ink-soft">Memoria</h2><p className="mt-1 text-xs leading-5 text-muted">Solo los recuerdos confirmados se recuperan en conversaciones futuras. Puedes corregirlos o borrarlos. Precios y stock se consultan en el CRM.</p></div>
        <div className="px-4 py-3 sm:px-5"><h2 className="text-xs font-medium text-ink-soft">Recordatorios</h2><p className="mt-1 text-xs leading-5 text-muted">Los vencimientos generan avisos dentro del CRM aunque cierres la web. Aparecen al volver; no son alarmas del ordenador ni envíos de WhatsApp.</p></div>
      </Panel>
    </div>
  </div>;
}
