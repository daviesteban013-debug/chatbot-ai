"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Brain, CalendarClock, Check, RefreshCw, Plus, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { workDate, type WorkItem } from "@/lib/workspace";

type Tab = "task" | "memory" | "proposed" | "history";
type View = { items: WorkItem[]; total: number; customers: { id: string; name: string | null; phone: string }[]; members: { user_id: string; role: string }[]; reminders: { item_id: string; due_at: string }[]; userId: string; canWrite: boolean; tenantName: string };
const tabs: { key: Tab; label: string }[] = [{ key: "task", label: "Tareas" }, { key: "memory", label: "Memoria" }, { key: "proposed", label: "Por confirmar" }, { key: "history", label: "Historial" }];
const inputClass = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100";
const buttonClass = "inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium transition hover:bg-slate-50 disabled:opacity-50";
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
  return <div className="mx-auto max-w-6xl space-y-7 px-5 py-8 lg:px-9 lg:py-10">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><p className="mb-2 text-xs font-semibold uppercase tracking-[.2em] text-amber-700">NEXO · Continuidad</p><h1 className="text-3xl font-semibold tracking-tight text-slate-950">Memoria y tareas</h1><p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">Lo que tu negocio necesita recordar. Lo que tu equipo necesita hacer.</p></div><div className="flex gap-2"><button className={buttonClass} onClick={() => void refresh()} disabled={loading || busy} aria-label="Actualizar"><RefreshCw size={16} /></button>{view?.canWrite && <button className={`${buttonClass} border-amber-400 bg-amber-300 hover:bg-amber-400`} onClick={() => openForm()} disabled={busy}><Plus size={16} /> Crear</button>}</div></header>
    <section className="grid gap-4 rounded-2xl border border-amber-100 bg-amber-50/60 p-5 sm:grid-cols-2"><div className="flex gap-3"><Brain size={22} className="shrink-0 text-amber-700"/><div><h2 className="font-semibold text-slate-900">Recuerdos con respaldo</h2><p className="mt-1 text-sm leading-6 text-slate-600">Solo los recuerdos confirmados se recuperan en conversaciones futuras. Puedes corregirlos o borrarlos. Precios y stock se consultan en el CRM.</p></div></div><div className="flex gap-3"><CalendarClock size={22} className="shrink-0 text-amber-700"/><div><h2 className="font-semibold text-slate-900">Seguimiento que permanece</h2><p className="mt-1 text-sm leading-6 text-slate-600">Los vencimientos generan avisos dentro del CRM aunque cierres la web. Aparecen al volver; no son alarmas del ordenador ni envíos de WhatsApp.</p></div></div></section>
    <div className="flex flex-wrap items-center justify-between gap-3"><nav className="flex gap-1 rounded-xl bg-slate-100 p-1" aria-label="Vistas de memoria y tareas">{tabs.map(t => <button key={t.key} onClick={() => { setTab(t.key); setPage(0); setForm(false); setView(null); setLoading(true); }} aria-current={tab === t.key ? "page" : undefined} className={`rounded-lg px-3 py-2 text-sm font-medium ${tab === t.key ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"}`}>{t.label}</button>)}</nav><Link href="/dashboard/jarvis" className="inline-flex items-center gap-1 text-sm font-medium text-slate-600">Pídeselo a NEXO <ArrowUpRight size={16}/></Link></div>
    {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</p>}
    {form && <form onSubmit={save} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-lg font-semibold">{editing ? "Corregir" : "Preparar propuesta"}</h2>
      {!editing && <label className="block text-sm font-medium">Tipo<select className={`${inputClass} mt-1`} value={kind} onChange={e => setKind(e.target.value as "task" | "memory")}><option value="task">Tarea con recordatorio</option><option value="memory">Recuerdo del negocio o cliente</option></select></label>}
      <label className="block text-sm font-medium">Título<input required maxLength={160} value={title} onChange={e => setTitle(e.target.value)} className={`${inputClass} mt-1`} placeholder={kind === "task" ? "Revisar el pedido de Ana" : "Preferencia de entrega de Ana"}/></label>
      <label className="block text-sm font-medium">{kind === "memory" ? "Hecho y contexto que quieres recordar" : "Detalles"}<textarea rows={3} maxLength={4000} value={body} onChange={e => setBody(e.target.value)} className={`${inputClass} mt-1`} /></label>
      {!editing && <label className="block text-sm font-medium">Cliente (opcional)<select value={customer} onChange={e => setCustomer(e.target.value)} className={`${inputClass} mt-1`}><option value="">Todo el negocio</option>{view?.customers.map(c => <option key={c.id} value={c.id}>{c.name || "Sin nombre"} · {c.phone}</option>)}</select><span className="mt-1 block text-xs font-normal text-slate-500">Hasta 100 clientes; NEXO puede buscar otros por nombre.</span></label>}
      {kind === "task" && <div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm font-medium">Fecha y hora<input required type="datetime-local" value={due} onChange={e => setDue(e.target.value)} className={`${inputClass} mt-1`}/><span className="mt-1 block text-xs font-normal text-slate-500">Hora de este dispositivo · {zone}</span></label><label className="block text-sm font-medium">Responsable<select value={assignee} onChange={e => setAssignee(e.target.value)} className={`${inputClass} mt-1`}><option value="">Yo</option>{view?.members.filter(m => m.user_id !== view.userId).map(m => <option key={m.user_id} value={m.user_id}>Miembro {m.user_id.slice(0, 8)} · {m.role}</option>)}</select></label></div>}
      <p className="text-xs leading-5 text-slate-500">{editing ? "Guardar corrige el registro activo y deja constancia del cambio." : "Revisa la propuesta y pulsa Confirmar en el siguiente paso. Todavía no se activará."}</p><div className="flex gap-2"><button type="submit" className={`${buttonClass} bg-slate-950 text-white hover:bg-slate-800`} disabled={busy}>{busy ? "Guardando…" : editing ? "Guardar corrección" : "Revisar propuesta"}</button><button type="button" className={buttonClass} onClick={() => setForm(false)} disabled={busy}>Cerrar</button></div>
    </form>}
    {loading && <p role="status" className="text-sm text-slate-500">Actualizando…</p>}
    {!loading && view && !view.items.length && <div className="rounded-2xl border border-dashed border-slate-300 px-6 py-12 text-center"><p className="font-medium text-slate-800">{tab === "proposed" ? "No tienes propuestas pendientes" : "Todavía no hay registros aquí"}</p><p className="mt-2 text-sm text-slate-500">Prueba: «NEXO, recuérdame revisar el pedido mañana a las 9, hora de Bogotá».</p></div>}
    <div className="grid gap-4 md:grid-cols-2">{view?.items.map(item => {
      const overdue = item.kind === "task" && item.status === "active" && Date.parse(item.due_at!) <= now;
      const reminder = view.reminders.some(r => r.item_id === item.id && Date.parse(r.due_at) === Date.parse(item.due_at ?? ""));
      const customerName = view.customers.find(c => c.id === item.customer_id)?.name;
      return <article key={item.id} className={`space-y-4 rounded-2xl border bg-white p-5 ${overdue ? "border-amber-300" : "border-slate-200"}`}>
        <div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{item.kind === "memory" ? "Memoria" : "Tarea"}{item.customer_id ? ` · ${customerName || "Cliente vinculado"}` : " · Negocio"}</span><span className={`rounded-full px-2 py-1 text-xs ${overdue ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"}`}>{({ proposed: "Por confirmar", active: overdue ? "Vencida" : "Activa", done: "Completada", canceled: "Cancelada" })[item.status]}</span></div>
        <div><h2 className="font-semibold text-slate-950">{item.title}</h2>{item.body && <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600">{item.body}</p>}</div>
        {item.due_at && <div className="rounded-xl bg-slate-50 p-3 text-sm"><p className="font-medium text-slate-800">{workDate(item.due_at, item.timezone)}</p><p className="mt-1 text-xs text-slate-500">{item.timezone} · {item.assignee_id === view.userId ? "Asignada a ti" : `Responsable ${item.assignee_id?.slice(0, 8) ?? "creador"}`}</p>{overdue && <p className="mt-2 text-xs font-medium text-amber-800">{reminder ? "Recordatorio disponible para ti" : "Vencimiento registrado · aviso interno en proceso o asignado a otro miembro"}</p>}</div>}
        <p className="text-xs leading-5 text-slate-400">{item.source_session ? "Origen: propuesta de conversación con NEXO" : "Origen: registro manual del CRM"}<br/>{item.confirmed_by ? `Confirmado por ${item.confirmed_by === view.userId ? "ti" : `miembro ${item.confirmed_by.slice(0, 8)}`}` : "Pendiente de revisión humana"} · {workDate(item.updated_at, "America/Bogota")} · versión {item.revision}</p>
        {view.canWrite && <div className="flex flex-wrap gap-2">{item.status === "proposed" && <><button className={`${buttonClass} border-amber-300 bg-amber-300 hover:bg-amber-400`} disabled={busy} onClick={() => void decide(item, "confirm")}><Check size={15}/> Confirmar</button><button className={buttonClass} disabled={busy} onClick={() => void decide(item, "cancel")}>Cancelar</button></>}{item.status === "active" && <>{item.kind === "task" && <button className={buttonClass} disabled={busy} onClick={() => void decide(item, "complete")}><Check size={15}/> Completar</button>}<button className={buttonClass} disabled={busy} onClick={() => openForm(item)}>Corregir{item.kind === "task" ? " / reprogramar" : ""}</button>{item.kind === "task" && <button className={buttonClass} disabled={busy} onClick={() => void decide(item, "cancel")}>Cancelar</button>}</>}{deleteId === item.id ? <><button className={`${buttonClass} text-rose-700`} disabled={busy} onClick={() => void decide(item, "delete")}>Confirmar borrado</button><button className={buttonClass} disabled={busy} onClick={() => setDeleteId(null)}>Conservar</button></> : <button className={`${buttonClass} text-slate-500`} disabled={busy} onClick={() => setDeleteId(item.id)}>Borrar</button>}</div>}
        {item.status === "proposed" && <p className="text-xs text-slate-400">Vence {workDate(item.expires_at, "America/Bogota")}. Al confirmar, será compartido con los miembros del negocio.</p>}
      </article>;
    })}</div>
    {!!view?.total && <div className="flex items-center justify-between text-sm text-slate-500"><p>{page * 30 + 1}–{Math.min((page + 1) * 30, view.total)} de {view.total}</p><div className="flex gap-2"><button className={buttonClass} disabled={!page || loading} onClick={() => setPage(page - 1)}>Anterior</button><button className={buttonClass} disabled={(page + 1) * 30 >= view.total || loading} onClick={() => setPage(page + 1)}>Siguiente</button></div></div>}
  </div>;
}
