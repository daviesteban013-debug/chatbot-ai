"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { ImageIcon, Package, Plus, Search, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/dashboard/empty-state";
import { formatCOP } from "@/lib/utils";
import type { CatalogProduct } from "@/lib/catalog/types";
import { ProductEditor } from "./product-editor";
import { ImportWizard } from "./import-wizard";

export function CatalogManager({ products, canEdit }: { products: CatalogProduct[]; canEdit: boolean }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<CatalogProduct | "new" | null>(null);
  const [importing, setImporting] = useState(false);

  const categories = useMemo(() => [...new Set(products.map(p => p.category).filter(Boolean) as string[])].sort(), [products]);
  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return products.filter(p => (showInactive || p.active) && (!category || p.category === category)
      && (!term || [p.name, p.sku, p.category, ...p.variants.map(v => `${v.sku} ${v.color ?? ""} ${v.size ?? ""}`)].join(" ").toLowerCase().includes(term)));
  }, [products, query, category, showInactive]);
  const inactive = products.filter(p => !p.active).length;

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar por nombre, SKU, color o talla" className="pl-9" aria-label="Buscar productos" />
        </div>
        {categories.length > 0 && (
          <select value={category} onChange={e => setCategory(e.target.value)} aria-label="Filtrar por categoría"
            className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700">
            <option value="">Todas las categorías</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        {inactive > 0 && (
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} className="size-4 rounded border-slate-300" />
            Ver archivados ({inactive})
          </label>
        )}
        {canEdit && (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setImporting(true)}><Sparkles className="size-4 text-amber-500" />Importar catálogo</Button>
            <Button onClick={() => setEditing("new")}><Plus className="size-4" />Nuevo producto</Button>
          </div>
        )}
      </div>

      {products.length === 0 ? (
        <EmptyState icon={Package} title="Tu catálogo está vacío"
          description="Agrega tus productos para que NEXO pueda venderlos por WhatsApp. Puedes subir un Excel, un PDF, fotos de tus productos o pegar tu lista de precios."
          action={canEdit ? <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={() => setImporting(true)}><Sparkles className="size-4" />Importar con IA</Button>
            <Button variant="secondary" onClick={() => setEditing("new")}><Plus className="size-4" />Crear a mano</Button>
          </div> : undefined} />
      ) : visible.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center text-sm text-slate-500">No hay productos que coincidan con la búsqueda.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {visible.map(product => <ProductCard key={product.id} product={product} onOpen={canEdit ? () => setEditing(product) : undefined} />)}
        </div>
      )}

      {editing && <ProductEditor product={editing === "new" ? null : editing} categories={categories} onClose={() => setEditing(null)} />}
      {importing && <ImportWizard onClose={() => setImporting(false)} />}
    </>
  );
}

function ProductCard({ product, onOpen }: { product: CatalogProduct; onOpen?: () => void }) {
  const active = product.variants.filter(v => v.active);
  const stock = active.reduce((sum, v) => sum + v.stock_qty - v.reserved_qty, 0);
  const photo = product.image_url ?? product.variants.find(v => v.image_url)?.image_url ?? null;
  const details = [...new Set(active.flatMap(v => [v.color, v.size]).filter(Boolean))].slice(0, 6).join(" · ");
  const Tag = onOpen ? "button" : "div";
  return (
    <Tag type={onOpen ? "button" : undefined} onClick={onOpen}
      className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white text-left shadow-sm shadow-slate-200/40 transition hover:border-slate-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900">
      <div className="relative aspect-[4/3] w-full bg-slate-100">
        {photo
          ? <Image src={photo} alt={product.name} fill sizes="(min-width: 1536px) 25vw, (min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw" className="object-cover" />
          : <div className="flex h-full items-center justify-center text-slate-300"><ImageIcon className="size-10" /></div>}
        {!product.active && <Badge variant="neutral" className="absolute left-3 top-3">Archivado</Badge>}
        {product.active && stock <= 0 && <Badge variant="danger" className="absolute left-3 top-3">Agotado</Badge>}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <h2 className="line-clamp-2 text-sm font-semibold text-slate-950 group-hover:text-blue-700">{product.name}</h2>
        <p className="mt-0.5 truncate text-xs text-slate-400">{product.sku}{product.category ? ` · ${product.category}` : ""}</p>
        <div className="mt-3 flex flex-wrap items-end gap-x-2 gap-y-1">
          <span className="text-lg font-semibold tracking-tight text-slate-950">{formatCOP(product.price_retail)}</span>
          {product.price_wholesale != null && <Badge variant="info">Mayorista {formatCOP(product.price_wholesale)}{product.wholesale_min_qty ? ` · ${product.wholesale_min_qty}+ u` : ""}</Badge>}
        </div>
        {details && <p className="mt-2 truncate text-xs text-slate-500">{details}</p>}
        <div className="mt-auto flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500">
          <span>{active.length} {active.length === 1 ? "variante" : "variantes"}</span>
          <span className={stock <= 0 ? "font-medium text-rose-600" : "font-medium text-slate-700"}>{Math.max(stock, 0)} disponibles</span>
        </div>
      </div>
    </Tag>
  );
}
