"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Camera, CheckCircle2, ClipboardPaste, FileUp, Loader2, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
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
      <div className="w-full sm:w-[22rem]">
        <Select value={mode} onChange={e => setMode(e.target.value as typeof mode)} aria-label="Qué hacer con productos que ya existen" className="h-9 py-0 text-[13px]">
          <option value="merge">Crear nuevos y actualizar los existentes</option>
          <option value="only_new">Solo crear nuevos (no tocar existentes)</option>
        </Select>
      </div>
      <div className="flex gap-2">
        <Button variant="secondary" onClick={() => setStep("source")}>Atrás</Button>
        <Button onClick={() => void confirm()}><CheckCircle2 className="size-4" />Importar {selected.length} producto{selected.length === 1 ? "" : "s"}</Button>
      </div>
    </div>
  ) : step === "done" ? <div className="flex justify-end"><Button onClick={onClose}>Listo</Button></div> : undefined;

  return (
    <Sheet title="Importar catálogo" onClose={onClose} footer={footer} wide={step === "review"}>
      {error && <p role="alert" className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2.5 text-[13px] text-rose-800">{error}</p>}

      {step === "source" && (
        <div className="space-y-5">
          <p className="text-[13px] leading-6 text-ink-soft">Sube un Excel, CSV, PDF o fotos de tus productos. NEXO los lee y te propone la lista de productos para que la revises. <strong className="font-medium text-ink">Nada se guarda hasta que confirmes.</strong></p>
          <div className="inline-flex max-w-full overflow-x-auto rounded-md border border-line bg-surface p-0.5" role="tablist">
            {([["file", FileUp, "Archivo"], ["photos", Camera, "Fotos"], ["text", ClipboardPaste, "Pegar texto"]] as const).map(([id, Icon, label]) => (
              <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
                className={cn("inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[5px] px-2.5 py-1 text-xs font-medium transition",
                  tab === id ? "bg-ink text-white" : "text-muted hover:bg-subtle hover:text-ink")}><Icon className="size-3.5" />{label}</button>
            ))}
          </div>

          {tab === "file" && (
            <button type="button" onClick={() => fileInput.current?.click()} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); sendFile(e.dataTransfer.files[0]); }}
              className="flex w-full flex-col items-center gap-2 rounded-md border border-dashed border-line-strong bg-subtle px-6 py-12 text-center transition hover:border-ink/30">
              <FileUp className="size-5 text-muted" />
              <span className="text-[13px] font-medium text-ink">Suelta aquí tu archivo o haz clic para elegirlo</span>
              <span className="text-xs text-muted">Excel, CSV, PDF, Word, TXT o una imagen del catálogo · hasta 10 MB</span>
              <input ref={fileInput} type="file" accept={FILE_ACCEPT} hidden onChange={e => { sendFile(e.target.files?.[0]); e.target.value = ""; }} />
            </button>
          )}

          {tab === "photos" && (
            <div className="space-y-3">
              <p className="text-xs text-muted">Fotos de tus productos (uno por foto) o de páginas de un catálogo impreso. Cada foto de producto queda como su imagen. Hasta 10 fotos.</p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {/* eslint-disable-next-line @next/next/no-img-element -- local previews (blob:) */}
                {previews.map((url, index) => <div key={url} className="relative aspect-square overflow-hidden rounded-md border border-line bg-subtle"><img src={url} alt={`Foto ${index + 1}`} className="size-full object-cover" />
                  <button type="button" onClick={() => setPhotos(list => list.filter((_, i) => i !== index))} aria-label="Quitar foto" className="absolute right-1 top-1 rounded-md border border-line bg-surface/90 p-1 text-ink-soft hover:text-rose-700"><Trash2 className="size-3.5" /></button></div>)}
                {photos.length < 10 && <button type="button" onClick={() => photoInput.current?.click()} className="flex aspect-square flex-col items-center justify-center gap-1 rounded-md border border-dashed border-line-strong bg-subtle text-xs text-muted transition hover:border-ink/30 hover:text-ink"><Camera className="size-4" />Agregar</button>}
              </div>
              <input ref={photoInput} type="file" accept="image/*" multiple hidden onChange={e => { const files = [...(e.target.files ?? [])]; setPhotos(list => [...list, ...files].slice(0, 10)); e.target.value = ""; }} />
              <Button onClick={sendPhotos} disabled={!photos.length}>Leer {photos.length || ""} foto{photos.length === 1 ? "" : "s"}</Button>
            </div>
          )}

          {tab === "text" && (
            <div className="space-y-3">
              <Textarea value={text} onChange={e => setText(e.target.value)} rows={10} maxLength={50000} className="text-[13px]"
                placeholder={"Pega tu lista de productos, por ejemplo:\nChaqueta bomber negra – tallas S, M, L – $149.000\nTenis Urban blancos 38 al 42 $189.000 (5 pares)"} />
              <Button onClick={sendText} disabled={!text.trim()}>Leer lista</Button>
            </div>
          )}
          <p className="border-t border-line pt-3 text-xs text-muted">Leer un archivo o fotos usa créditos de tu plan. El contenido del archivo se trata solo como datos.</p>
        </div>
      )}

      {(step === "reading" || step === "saving") && (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <Loader2 className="size-6 animate-spin text-muted" />
          <p className="text-[13px] font-medium text-ink">{step === "reading" ? "NEXO está leyendo tu catálogo…" : "Guardando productos…"}</p>
          <p className="text-xs text-muted">{step === "reading" ? "Puede tardar hasta un minuto en archivos grandes." : "Subiendo fotos e importando."}</p>
        </div>
      )}

      {step === "review" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-[13px] text-ink-soft">
            <span>Encontré <strong className="font-semibold tabular-nums text-ink">{rows.length}</strong> productos.</span>
            <Badge variant="success" className="tabular-nums">{rows.filter(r => !r.existingId).length} nuevos</Badge>
            <Badge variant="info" className="tabular-nums">{rows.filter(r => r.existingId).length} ya existen</Badge>
            {missingPrice > 0 && <Badge variant="warning" className="tabular-nums">{missingPrice} sin precio</Badge>}
          </div>
          {warnings.map(w => <p key={w} className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"><AlertTriangle className="size-4 shrink-0" />{w}</p>)}
          <div className="divide-y divide-line rounded-lg border border-line bg-surface">
            {rows.map(row => (
              <div key={row.key} className={`grid gap-3 p-3 sm:grid-cols-[24px_56px_1fr] ${row.include ? "" : "opacity-50"}`}>
                <input type="checkbox" checked={row.include} onChange={e => update(row.key, { include: e.target.checked })} aria-label={`Incluir ${row.name}`} className="mt-3 size-4 rounded border-line-strong accent-ink" />
                <div className="hidden size-14 overflow-hidden rounded-md border border-line bg-subtle sm:block">
                  {/* eslint-disable-next-line @next/next/no-img-element -- local previews (blob:) */}
                  {row.photo !== undefined && previews[row.photo] && <img src={previews[row.photo]} alt="" className="size-full object-cover" />}
                </div>
                <div className="min-w-0 space-y-2">
                  <div className="grid gap-2 sm:grid-cols-[1fr_160px_150px]">
                    <Input value={row.name} onChange={e => update(row.key, { name: e.target.value })} aria-label="Nombre" maxLength={160} className="text-[13px]" />
                    <Input value={row.category ?? ""} onChange={e => update(row.key, { category: e.target.value || null })} aria-label="Categoría" placeholder="Categoría" maxLength={60} className="text-[13px]" />
                    <Input inputMode="numeric" value={row.priceText} onChange={e => update(row.key, { priceText: e.target.value })} aria-label="Precio" placeholder="Precio COP"
                      className={cn("text-[13px] tabular-nums", row.price_retail === null && "border-amber-300 bg-amber-50")} />
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant={row.existingId ? "info" : "success"}>{row.existingId ? "Actualiza existente" : "Nuevo"}</Badge>
                    {row.variants.map((v, index) => (
                      <label key={index} className="inline-flex items-center gap-1 rounded-md border border-line bg-surface py-0.5 pl-2 pr-0.5 text-xs text-ink-soft">
                        {[v.color, v.size].filter(Boolean).join(" / ") || "Stock"}
                        <input inputMode="numeric" value={v.stock_qty ?? ""} placeholder="0" aria-label="Unidades"
                          onChange={e => update(row.key, { variants: row.variants.map((item, i) => i === index ? { ...item, stock_qty: parseQuantity(e.target.value) } : item) })}
                          className="w-12 rounded-[4px] bg-subtle px-1.5 py-0.5 text-center tabular-nums text-ink outline-none focus:ring-2 focus:ring-ink/10" />
                      </label>
                    ))}
                    {row.warnings.filter(w => w !== "Falta el precio").map(w => <span key={w} className="text-xs text-amber-800">· {w}</span>)}
                  </div>
                  {row.description && <p className="line-clamp-1 text-xs text-muted">{row.description}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {step === "done" && summary && (
        <div className="space-y-3 py-10 text-center">
          <CheckCircle2 className="mx-auto size-7 text-emerald-600" />
          <p className="text-base font-semibold text-ink">Catálogo actualizado</p>
          <p className="text-[13px] tabular-nums text-ink-soft">{summary.created} creados · {summary.updated} actualizados · {summary.skipped} omitidos</p>
          {summary.results.filter(r => r.status === "skipped").length > 0 && (
            <ul className="mx-auto max-w-md space-y-1 rounded-md border border-line bg-subtle px-3 py-2.5 text-left text-xs text-ink-soft">
              {summary.results.filter(r => r.status === "skipped").slice(0, 20).map(r => <li key={r.index}>• {selected[r.index]?.name ?? `Producto ${r.index + 1}`}: {REASONS[r.reason ?? ""] ?? "no se pudo importar"}</li>)}
            </ul>
          )}
          <p className="text-xs text-muted">NEXO ya puede ofrecer estos productos por WhatsApp. Revisa el stock antes de activarlo con clientes.</p>
        </div>
      )}
    </Sheet>
  );
}
