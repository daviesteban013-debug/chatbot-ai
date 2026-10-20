"use client";

import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Camera, ImageIcon, Loader2, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { parsePrice, parseQuantity } from "@/lib/catalog/drafts";
import { uploadProductPhoto, type CatalogProduct } from "@/lib/catalog/types";
import { archiveProduct, saveProduct } from "@/app/dashboard/catalog/actions";
import { Field, Sheet } from "./sheet";

type VariantRow = { key: string; id?: string; sku: string; color: string; size: string; stock: string; price: string; image_url: string | null; reserved: number };
const key = () => Math.random().toString(36).slice(2);
const money = (value: number | null | undefined) => value == null ? "" : value.toLocaleString("es-CO");

export function ProductEditor({ product, categories, onClose }: { product: CatalogProduct | null; categories: string[]; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const active = product?.variants.filter(v => v.active) ?? [];
  const single = active.length <= 1 && !active.some(v => v.color || v.size) ? active[0] : undefined;
  const [form, setForm] = useState({
    name: product?.name ?? "", sku: product?.sku ?? "", description: product?.description ?? "", category: product?.category ?? "",
    price: money(product?.price_retail), wholesale: money(product?.price_wholesale), wholesaleMin: product?.wholesale_min_qty?.toString() ?? "",
    image_url: product?.image_url ?? null as string | null, active: product?.active ?? true,
    stock: single ? String(single.stock_qty) : "0",
  });
  const [hasVariants, setHasVariants] = useState(!single && active.length > 0);
  const [variants, setVariants] = useState<VariantRow[]>(() => (single ? [] : active).map(v => ({
    key: key(), id: v.id, sku: v.sku, color: v.color ?? "", size: v.size ?? "", stock: String(v.stock_qty),
    price: money(v.price_override), image_url: v.image_url, reserved: v.reserved_qty,
  })));
  const [combo, setCombo] = useState({ colors: "", sizes: "" });
  const set = (patch: Partial<typeof form>) => setForm(current => ({ ...current, ...patch }));
  const setVariant = (rowKey: string, patch: Partial<VariantRow>) => setVariants(rows => rows.map(row => row.key === rowKey ? { ...row, ...patch } : row));

  async function upload(file: File | undefined, target: "product" | string) {
    if (!file) return;
    setUploading(target); setError(null);
    try {
      const url = await uploadProductPhoto(file, file.name);
      if (target === "product") set({ image_url: url }); else setVariant(target, { image_url: url });
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo subir la foto."); }
    finally { setUploading(null); }
  }

  function generate() {
    const split = (value: string) => value.split(/[,;\n]/).map(s => s.trim()).filter(Boolean);
    const colors = split(combo.colors), sizes = split(combo.sizes);
    if (!colors.length && !sizes.length) return;
    const pairs = (colors.length ? colors : [""]).flatMap(color => (sizes.length ? sizes : [""]).map(size => ({ color, size })));
    setVariants(rows => [...rows, ...pairs
      .filter(p => !rows.some(r => r.color.toLowerCase() === p.color.toLowerCase() && r.size.toLowerCase() === p.size.toLowerCase()))
      .map(p => ({ key: key(), sku: "", ...p, stock: "0", price: "", image_url: null, reserved: 0 }))]);
    setCombo({ colors: "", sizes: "" });
  }

  function submit() {
    setError(null);
    const price = parsePrice(form.price);
    if (!form.name.trim()) return setError("Escribe el nombre del producto.");
    if (price === null) return setError("Escribe el precio al detal en pesos.");
    if (hasVariants && !variants.length) return setError("Agrega al menos una variante o desactiva tallas y colores.");
    const rows = hasVariants
      ? variants.map(v => ({ id: v.id, sku: v.sku.trim() || null, color: v.color.trim() || null, size: v.size.trim() || null,
          stock_qty: parseQuantity(v.stock) ?? 0, price_override: v.price.trim() ? parsePrice(v.price) : null, image_url: v.image_url }))
      : [{ id: single?.id, sku: single?.sku ?? null, color: null, size: null, stock_qty: parseQuantity(form.stock) ?? 0, price_override: null, image_url: single?.image_url ?? null }];
    start(async () => {
      const result = await saveProduct({
        id: product?.id, sku: form.sku.trim() || null, name: form.name, description: form.description, category: form.category,
        price_retail: price, price_wholesale: form.wholesale.trim() ? parsePrice(form.wholesale) : null,
        wholesale_min_qty: form.wholesaleMin.trim() ? parseQuantity(form.wholesaleMin) || null : null,
        image_url: form.image_url, active: form.active, variants: rows,
      });
      if (!result.ok) return setError(result.error);
      router.refresh(); onClose();
    });
  }

  function archive() {
    if (!product || !window.confirm("¿Quitar este producto del catálogo? Si ya tiene pedidos, quedará archivado para conservar el historial.")) return;
    start(async () => {
      const result = await archiveProduct(product.id);
      if (!result.ok) return setError(result.error);
      router.refresh(); onClose();
    });
  }

  const footer = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      {product ? <Button variant="ghost" onClick={archive} disabled={pending} className="text-rose-700 hover:bg-rose-50 hover:text-rose-800"><Trash2 className="size-4" />Quitar</Button> : <span />}
      <div className="flex gap-2">
        <Button variant="secondary" onClick={onClose} disabled={pending}>Cancelar</Button>
        <Button onClick={submit} disabled={pending || !!uploading}>{pending && <Loader2 className="size-4 animate-spin" />}Guardar producto</Button>
      </div>
    </div>
  );

  return (
    <Sheet title={product ? "Editar producto" : "Nuevo producto"} onClose={onClose} footer={footer}>
      {error && <p role="alert" className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2.5 text-[13px] text-rose-800">{error}</p>}
      <div className="grid gap-5 sm:grid-cols-[180px_1fr]">
        <PhotoSlot url={form.image_url} busy={uploading === "product"} label="Foto principal"
          onPick={file => void upload(file, "product")} onClear={() => set({ image_url: null })} />
        <div className="space-y-4">
          <Field label="Nombre"><Input value={form.name} onChange={e => set({ name: e.target.value })} maxLength={160} placeholder="Ej: Chaqueta bomber negra" autoFocus={!product} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Precio al detal (COP)"><Input inputMode="numeric" value={form.price} onChange={e => set({ price: e.target.value })} placeholder="149.000" className="tabular-nums" /></Field>
            <Field label="Categoría">
              <Input value={form.category} onChange={e => set({ category: e.target.value })} maxLength={60} list="catalog-categories" placeholder="Ej: Chaquetas" />
              <datalist id="catalog-categories">{categories.map(c => <option key={c} value={c} />)}</datalist>
            </Field>
          </div>
        </div>
      </div>

      <div className="mt-5 space-y-4">
        <Field label="Descripción" hint="Zorax la usa para recomendar el producto. Materiales, medidas, uso…">
          <Textarea value={form.description} onChange={e => set({ description: e.target.value })} maxLength={2000} rows={3} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Precio mayorista (opcional)"><Input inputMode="numeric" value={form.wholesale} onChange={e => set({ wholesale: e.target.value })} placeholder="—" /></Field>
          <Field label="Mínimo para mayorista"><Input inputMode="numeric" value={form.wholesaleMin} onChange={e => set({ wholesaleMin: e.target.value })} placeholder="Ej: 12" /></Field>
          <Field label="SKU (opcional)" hint="Se genera solo si lo dejas vacío."><Input value={form.sku} onChange={e => set({ sku: e.target.value.toUpperCase() })} maxLength={60} /></Field>
        </div>

        <div className="rounded-md border border-line">
          <label className="flex items-center justify-between gap-3 px-4 py-3">
            <span><span className="block text-[13px] font-medium text-ink">Tiene tallas o colores</span><span className="text-xs text-muted">Cada combinación lleva su propio stock.</span></span>
            <input type="checkbox" checked={hasVariants} onChange={e => setHasVariants(e.target.checked)} className="size-4 rounded border-line-strong accent-ink" />
          </label>
          {!hasVariants ? (
            <div className="border-t border-line px-4 py-3"><div className="max-w-48"><Field label="Unidades en stock"><Input inputMode="numeric" value={form.stock} onChange={e => set({ stock: e.target.value })} className="tabular-nums" /></Field></div></div>
          ) : (
            <div className="space-y-2 border-t border-line px-4 py-3">
              <div className="grid gap-2 rounded-md border border-line bg-subtle p-2.5 sm:grid-cols-[1fr_1fr_auto]">
                <Input value={combo.colors} onChange={e => setCombo(c => ({ ...c, colors: e.target.value }))} placeholder="Colores: Negro, Blanco" aria-label="Colores" />
                <Input value={combo.sizes} onChange={e => setCombo(c => ({ ...c, sizes: e.target.value }))} placeholder="Tallas: S, M, L" aria-label="Tallas" />
                <Button variant="secondary" onClick={generate}>Crear combinaciones</Button>
              </div>
              {variants.map(v => (
                <div key={v.key} className="grid grid-cols-[48px_1fr_1fr] items-end gap-2 rounded-md border border-line p-2 sm:grid-cols-[48px_1fr_1fr_90px_120px_32px]">
                  <MiniPhoto url={v.image_url} busy={uploading === v.key} onPick={file => void upload(file, v.key)} />
                  <Input value={v.color} onChange={e => setVariant(v.key, { color: e.target.value })} placeholder="Color" aria-label="Color" maxLength={40} />
                  <Input value={v.size} onChange={e => setVariant(v.key, { size: e.target.value })} placeholder="Talla" aria-label="Talla" maxLength={40} />
                  <Input inputMode="numeric" value={v.stock} onChange={e => setVariant(v.key, { stock: e.target.value })} aria-label="Stock" placeholder="Stock" className="tabular-nums" title={v.reserved ? `${v.reserved} reservadas en pedidos` : undefined} />
                  <Input inputMode="numeric" value={v.price} onChange={e => setVariant(v.key, { price: e.target.value })} aria-label="Precio especial" placeholder="Precio especial" className="tabular-nums" />
                  <button type="button" onClick={() => setVariants(rows => rows.filter(row => row.key !== v.key))} aria-label="Quitar variante" className="flex h-10 items-center justify-center rounded-md text-muted transition hover:bg-rose-50 hover:text-rose-700"><X className="size-4" /></button>
                </div>
              ))}
              <Button variant="ghost" size="sm" onClick={() => setVariants(rows => [...rows, { key: key(), sku: "", color: "", size: "", stock: "0", price: "", image_url: null, reserved: 0 }])}><Plus className="size-4" />Agregar variante</Button>
            </div>
          )}
        </div>

        <label className="flex items-center gap-3 text-[13px] text-ink-soft">
          <input type="checkbox" checked={form.active} onChange={e => set({ active: e.target.checked })} className="size-4 rounded border-line-strong accent-ink" />
          Disponible para la venta (Zorax lo ofrece por WhatsApp)
        </label>
      </div>
    </Sheet>
  );
}

function PhotoSlot({ url, busy, label, onPick, onClear }: { url: string | null; busy: boolean; label: string; onPick: (file?: File) => void; onClear: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div>
      <button type="button" onClick={() => input.current?.click()} aria-label={label}
        onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); onPick(e.dataTransfer.files[0]); }}
        className="relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-md border border-dashed border-line-strong bg-subtle text-muted transition hover:border-ink/30 hover:text-ink-soft">
        {url ? <Image src={url} alt="" fill sizes="180px" className="object-cover" />
          : <span className="flex flex-col items-center gap-2 px-3 text-center text-xs">{busy ? <Loader2 className="size-6 animate-spin" /> : <Camera className="size-6" />}Sube o toma una foto</span>}
        {url && busy && <span className="absolute inset-0 flex items-center justify-center bg-surface/70"><Loader2 className="size-6 animate-spin" /></span>}
      </button>
      <input ref={input} type="file" accept="image/*" capture="environment" hidden onChange={e => { onPick(e.target.files?.[0]); e.target.value = ""; }} />
      {url && <button type="button" onClick={onClear} className="mt-2 text-xs text-muted transition hover:text-rose-700">Quitar foto</button>}
    </div>
  );
}

function MiniPhoto({ url, busy, onPick }: { url: string | null; busy: boolean; onPick: (file?: File) => void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" onClick={() => input.current?.click()} aria-label="Foto de la variante"
        className="relative flex size-12 items-center justify-center overflow-hidden rounded-md border border-line bg-subtle text-muted">
        {busy ? <Loader2 className="size-4 animate-spin" /> : url ? <Image src={url} alt="" fill sizes="48px" className="object-cover" /> : <ImageIcon className="size-4" />}
      </button>
      <input ref={input} type="file" accept="image/*" hidden onChange={e => { onPick(e.target.files?.[0]); e.target.value = ""; }} />
    </>
  );
}
