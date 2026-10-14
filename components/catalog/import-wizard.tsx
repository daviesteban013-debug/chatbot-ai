"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Camera, CheckCircle2, ClipboardPaste, FileUp, Loader2, Sparkles, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { parsePrice, parseQuantity, withWarnings, type DraftProduct } from "@/lib/catalog/drafts";
import { uploadProductPhoto } from "@/lib/catalog/types";
import { importProducts, type ImportSummary } from "@/app/dashboard/catalog/actions";
import { Sheet } from "./sheet";

type Row = DraftProduct & { key: string; include: boolean; existingId: string | null; priceText: string };
type Step = "source" | "reading" | "review" | "saving" | "done";
const REASONS: Record<string, string> = {
  exists: "ya existe (modo solo nuevos)", catalog_invalid_price: "precio inválido", catalog_invalid_name: "sin nombre",
  catalog_sku_taken: "SKU repetido", catalog_invalid_sku: "SKU inválido", catalog_stock_below_reserved: "stock menor a lo reservado",
};
const FILE_ACCEPT = ".pdf,.xlsx,.csv,.docx,.txt,.md,.png,.jpg,.jpeg,.webp";

export function ImportWizard({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("source");
  const [tab, setTab] = useState<"file" | "photos" | "text">("file");
  const [text, setText] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"merge" | "only_new">("merge");
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const fileInput = useRef<HTMLInputElement>(null), photoInput = useRef<HTMLInputElement>(null);
  const previews = useMemo(() => photos.map(photo => URL.createObjectURL(photo)), [photos]);
  useEffect(() => () => previews.forEach(url => URL.revokeObjectURL(url)), [previews]);

  async function read(body: FormData) {
    setError(null); setStep("reading");
    try {
      const response = await fetch("/api/catalog/import", { method: "POST", body });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "No pude leer el catálogo.");
      const products = data.products as (DraftProduct & { existingId: string | null })[];
      if (!products.length) throw new Error("No encontré productos. Prueba con otro archivo o pega la lista como texto.");
      setRows(products.map((p, index) => ({ ...p, key: `${index}`, include: true, priceText: p.price_retail == null ? "" : p.price_retail.toLocaleString("es-CO") })));
      setWarnings(data.warnings ?? []); setStep("review");
    } catch (e) { setError(e instanceof Error ? e.message : "No pude leer el catálogo."); setStep("source"); }
  }
  const sendFile = (file?: File) => { if (!file) return; const body = new FormData(); body.append("file", file); void read(body); };
  const sendPhotos = () => { const body = new FormData(); photos.forEach(photo => body.append("photos", photo)); void read(body); };
  const sendText = () => { const body = new FormData(); body.append("text", text); void read(body); };

  const update = (key: string, patch: Partial<Row>) => setRows(list => list.map(row => {
    if (row.key !== key) return row;
    const next = { ...row, ...patch };
    if ("priceText" in patch) next.price_retail = parsePrice(next.priceText);
    return { ...next, warnings: withWarnings(next).warnings };
  }));
  const selected = rows.filter(row => row.include);
  const missingPrice = selected.filter(row => row.price_retail === null).length;

  async function confirm() {
    if (!selected.length) return setError("Selecciona al menos un producto.");
    if (missingPrice) return setError(`Completa el precio de ${missingPrice} producto${missingPrice === 1 ? "" : "s"} o desmárcalos.`);
    setError(null); setStep("saving");
    try {
      const items = [];
      for (const row of selected) {
        let image_url = row.image_url;
        if (row.photo !== undefined && photos[row.photo]) image_url = await uploadProductPhoto(photos[row.photo], photos[row.photo].name);
        items.push({
          sku: row.sku, name: row.name, description: row.description, category: row.category,
          price_retail: row.price_retail, price_wholesale: row.price_wholesale, wholesale_min_qty: row.wholesale_min_qty, image_url,
          variants: row.variants.map(v => ({ sku: v.sku, color: v.color, size: v.size, stock_qty: v.stock_qty, price_override: v.price_override })),
        });
      }
      const result = await importProducts(items, mode);
      if (!result.ok) throw new Error(result.error);
      setSummary(result.data); setStep("done"); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo importar."); setStep("review"); }
  }

  const footer = step === "review" ? (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <select value={mode} onChange={e => setMode(e.target.value as typeof mode)} aria-label="Qué hacer con productos que ya existen" className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm">
        <option value="merge">Crear nuevos y actualizar los existentes</option>
        <option value="only_new">Solo crear nuevos (no tocar existentes)</option>
      </select>
      <div className="flex gap-2">
        <Button variant="secondary" onClick={() => setStep("source")}>Atrás</Button>
        <Button onClick={() => void confirm()}><CheckCircle2 className="size-4" />Importar {selected.length} producto{selected.length === 1 ? "" : "s"}</Button>
      </div>
    </div>
  ) : step === "done" ? <div className="flex justify-end"><Button onClick={onClose}>Listo</Button></div> : undefined;

  return (
    <Sheet title="Importar catálogo con IA" onClose={onClose} footer={footer} wide={step === "review"}>
      {error && <p role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}

      {step === "source" && (
        <div className="space-y-5">
          <p className="text-sm leading-6 text-slate-600">NEXO lee tu catálogo en el formato que lo tengas y te muestra los productos para que los revises. <strong className="font-medium text-slate-900">Nada se guarda hasta que confirmes.</strong></p>
          <div className="grid grid-cols-3 gap-2 rounded-xl bg-slate-100 p-1" role="tablist">
            {([["file", FileUp, "Archivo"], ["photos", Camera, "Fotos"], ["text", ClipboardPaste, "Pegar texto"]] as const).map(([id, Icon, label]) => (
              <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
                className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${tab === id ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"}`}><Icon className="size-4" />{label}</button>
            ))}
          </div>

          {tab === "file" && (
            <button type="button" onClick={() => fileInput.current?.click()} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); sendFile(e.dataTransfer.files[0]); }}
              className="flex w-full flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center hover:border-slate-400">
              <FileUp className="size-8 text-slate-400" />
              <span className="text-sm font-medium text-slate-900">Suelta aquí tu archivo o haz clic para elegirlo</span>
              <span className="text-xs text-slate-500">Excel, CSV, PDF, Word, TXT o una imagen del catálogo · hasta 10 MB</span>
              <input ref={fileInput} type="file" accept={FILE_ACCEPT} hidden onChange={e => { sendFile(e.target.files?.[0]); e.target.value = ""; }} />
            </button>
          )}

          {tab === "photos" && (
            <div className="space-y-3">
              <p className="text-xs text-slate-500">Fotos de tus productos (uno por foto) o de páginas de un catálogo impreso. Cada foto de producto queda como su imagen. Hasta 10 fotos.</p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {/* eslint-disable-next-line @next/next/no-img-element -- local previews (blob:) */}
                {previews.map((url, index) => <div key={url} className="relative aspect-square overflow-hidden rounded-xl bg-slate-100"><img src={url} alt={`Foto ${index + 1}`} className="size-full object-cover" />
                  <button type="button" onClick={() => setPhotos(list => list.filter((_, i) => i !== index))} aria-label="Quitar foto" className="absolute right-1 top-1 rounded-md bg-white/90 p-1 text-slate-600"><Trash2 className="size-3.5" /></button></div>)}
                {photos.length < 10 && <button type="button" onClick={() => photoInput.current?.click()} className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-200 text-xs text-slate-500 hover:border-slate-400"><Camera className="size-5" />Agregar</button>}
              </div>
              <input ref={photoInput} type="file" accept="image/*" multiple hidden onChange={e => { const files = [...(e.target.files ?? [])]; setPhotos(list => [...list, ...files].slice(0, 10)); e.target.value = ""; }} />
              <Button onClick={sendPhotos} disabled={!photos.length}><Sparkles className="size-4" />Leer {photos.length || ""} foto{photos.length === 1 ? "" : "s"}</Button>
            </div>
          )}

          {tab === "text" && (
            <div className="space-y-3">
              <Textarea value={text} onChange={e => setText(e.target.value)} rows={10} maxLength={50000}
                placeholder={"Pega tu lista de productos, por ejemplo:\nChaqueta bomber negra – tallas S, M, L – $149.000\nTenis Urban blancos 38 al 42 $189.000 (5 pares)"} />
              <Button onClick={sendText} disabled={!text.trim()}><Sparkles className="size-4" />Leer lista</Button>
            </div>
          )}
          <p className="text-xs text-slate-400">La lectura con IA usa créditos de tu plan. El contenido del archivo se trata solo como datos.</p>
        </div>
      )}

      {(step === "reading" || step === "saving") && (
        <div className="flex flex-col items-center gap-4 py-20 text-center">
          <Loader2 className="size-8 animate-spin text-slate-400" />
          <p className="text-sm font-medium text-slate-900">{step === "reading" ? "NEXO está leyendo tu catálogo…" : "Guardando productos…"}</p>
          <p className="text-xs text-slate-500">{step === "reading" ? "Puede tardar hasta un minuto en archivos grandes." : "Subiendo fotos e importando."}</p>
        </div>
      )}

      {step === "review" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
            <span>Encontré <strong className="text-slate-950">{rows.length}</strong> productos.</span>
            <Badge variant="success">{rows.filter(r => !r.existingId).length} nuevos</Badge>
            <Badge variant="info">{rows.filter(r => r.existingId).length} ya existen</Badge>
            {missingPrice > 0 && <Badge variant="warning">{missingPrice} sin precio</Badge>}
          </div>
          {warnings.map(w => <p key={w} className="flex gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800"><AlertTriangle className="size-4 shrink-0" />{w}</p>)}
          <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200">
            {rows.map(row => (
              <div key={row.key} className={`grid gap-3 p-3 sm:grid-cols-[24px_56px_1fr] ${row.include ? "" : "opacity-50"}`}>
                <input type="checkbox" checked={row.include} onChange={e => update(row.key, { include: e.target.checked })} aria-label={`Incluir ${row.name}`} className="mt-3 size-4 rounded border-slate-300" />
                <div className="hidden size-14 overflow-hidden rounded-lg bg-slate-100 sm:block">
                  {/* eslint-disable-next-line @next/next/no-img-element -- local previews (blob:) */}
                  {row.photo !== undefined && previews[row.photo] && <img src={previews[row.photo]} alt="" className="size-full object-cover" />}
                </div>
                <div className="min-w-0 space-y-2">
                  <div className="grid gap-2 sm:grid-cols-[1fr_160px_150px]">
                    <Input value={row.name} onChange={e => update(row.key, { name: e.target.value })} aria-label="Nombre" maxLength={160} />
                    <Input value={row.category ?? ""} onChange={e => update(row.key, { category: e.target.value || null })} aria-label="Categoría" placeholder="Categoría" maxLength={60} />
                    <Input inputMode="numeric" value={row.priceText} onChange={e => update(row.key, { priceText: e.target.value })} aria-label="Precio" placeholder="Precio COP"
                      className={row.price_retail === null ? "border-amber-300 bg-amber-50" : ""} />
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant={row.existingId ? "info" : "success"}>{row.existingId ? "Actualiza existente" : "Nuevo"}</Badge>
                    {row.variants.map((v, index) => (
                      <label key={index} className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white py-0.5 pl-2 pr-1 text-xs text-slate-600">
                        {[v.color, v.size].filter(Boolean).join(" / ") || "Stock"}
                        <input inputMode="numeric" value={v.stock_qty ?? ""} placeholder="0" aria-label="Unidades"
                          onChange={e => update(row.key, { variants: row.variants.map((item, i) => i === index ? { ...item, stock_qty: parseQuantity(e.target.value) } : item) })}
                          className="w-12 rounded-full bg-slate-100 px-1.5 py-0.5 text-center" />
                      </label>
                    ))}
                    {row.warnings.filter(w => w !== "Falta el precio").map(w => <span key={w} className="text-xs text-amber-700">· {w}</span>)}
                  </div>
                  {row.description && <p className="line-clamp-1 text-xs text-slate-500">{row.description}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {step === "done" && summary && (
        <div className="space-y-4 py-10 text-center">
          <CheckCircle2 className="mx-auto size-10 text-emerald-500" />
          <p className="text-lg font-semibold text-slate-950">Catálogo actualizado</p>
          <p className="text-sm text-slate-600">{summary.created} creados · {summary.updated} actualizados · {summary.skipped} omitidos</p>
          {summary.results.filter(r => r.status === "skipped").length > 0 && (
            <ul className="mx-auto max-w-md space-y-1 text-left text-xs text-slate-500">
              {summary.results.filter(r => r.status === "skipped").slice(0, 20).map(r => <li key={r.index}>• {selected[r.index]?.name ?? `Producto ${r.index + 1}`}: {REASONS[r.reason ?? ""] ?? "no se pudo importar"}</li>)}
            </ul>
          )}
          <p className="text-xs text-slate-400">NEXO ya puede ofrecer estos productos por WhatsApp. Revisa el stock antes de activarlo con clientes.</p>
        </div>
      )}
    </Sheet>
  );
}
