"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { ImageIcon, Package, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Panel, StatusDot } from "@/components/dashboard/panel";
import { cn, formatCOP } from "@/lib/utils";
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
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar por nombre, SKU, color o talla" className="h-9 py-0 pl-9 text-[13px]" aria-label="Buscar productos" />
        </div>
        {categories.length > 0 && (
          <div className="w-full sm:w-52">
            <Select value={category} onChange={e => setCategory(e.target.value)} aria-label="Filtrar por categoría" className="h-9 py-0 text-[13px]">
              <option value="">Todas las categorías</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </Select>
          </div>
        )}
        {inactive > 0 && (
          <label className="flex h-9 items-center gap-2 px-1 text-[13px] text-ink-soft">
            <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} className="size-4 rounded border-line-strong accent-ink" />
            Ver archivados <span className="tabular-nums text-muted">({inactive})</span>
          </label>
        )}
        {canEdit && (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setImporting(true)}>Importar catálogo</Button>
            <Button onClick={() => setEditing("new")}><Plus className="size-4" />Nuevo producto</Button>
          </div>
        )}
      </div>

      {products.length === 0 ? (
        <EmptyState icon={Package} title="Tu catálogo está vacío"
          description="Agrega tus productos para que NEXO pueda venderlos por WhatsApp. Puedes subir un Excel, un PDF, fotos de tus productos o pegar tu lista de precios."
          action={canEdit ? <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={() => setImporting(true)}>Importar catálogo</Button>
            <Button variant="secondary" onClick={() => setEditing("new")}><Plus className="size-4" />Crear a mano</Button>
          </div> : undefined} />
      ) : visible.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line-strong bg-surface px-6 py-10 text-center text-sm text-muted">No hay productos que coincidan con la búsqueda.</p>
      ) : (
        <Panel className="overflow-hidden">
          <Table className="text-[13px]">
            <TableHeader>
              <tr>
                <TableHead className="px-4 sm:px-5">Producto</TableHead>
                <TableHead className="hidden sm:table-cell">Estado</TableHead>
                <TableHead className="hidden text-right md:table-cell">Variantes</TableHead>
                <TableHead className="hidden text-right lg:table-cell">Mayorista</TableHead>
                <TableHead className="text-right">Precio</TableHead>
                <TableHead className="px-4 text-right sm:px-5">Disponibles</TableHead>
              </tr>
            </TableHeader>
            <TableBody>
              {visible.map(product => <ProductRow key={product.id} product={product} onOpen={canEdit ? () => setEditing(product) : undefined} />)}
            </TableBody>
          </Table>
        </Panel>
      )}

      {editing && <ProductEditor product={editing === "new" ? null : editing} categories={categories} onClose={() => setEditing(null)} />}
      {importing && <ImportWizard onClose={() => setImporting(false)} />}
    </>
  );
}

function ProductRow({ product, onOpen }: { product: CatalogProduct; onOpen?: () => void }) {
  const active = product.variants.filter(v => v.active);
  const stock = active.reduce((sum, v) => sum + v.stock_qty - v.reserved_qty, 0);
  const photo = product.image_url ?? product.variants.find(v => v.image_url)?.image_url ?? null;
  const details = [...new Set(active.flatMap(v => [v.color, v.size]).filter(Boolean))].slice(0, 6).join(" · ");
  const flag = !product.active ? "Archivado" : stock <= 0 ? "Agotado" : null;
  return (
    // The whole row opens the editor; the name button gives keyboard access and its click bubbles to the row.
    <TableRow onClick={onOpen} className={cn(onOpen && "cursor-pointer")}>
      <TableCell className="px-4 sm:px-5">
        <div className="flex items-center gap-3">
          <div className="relative size-10 shrink-0 overflow-hidden rounded-md border border-line bg-subtle">
            {photo
              ? <Image src={photo} alt={product.name} fill sizes="40px" className="object-cover" />
              : <span className="flex size-full items-center justify-center text-muted"><ImageIcon className="size-4" /></span>}
          </div>
          <div className="min-w-0">
            {onOpen
              ? <button type="button" className="rounded-sm text-left font-medium text-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2"><span className="line-clamp-2">{product.name}</span></button>
              : <p className="line-clamp-2 font-medium text-ink">{product.name}</p>}
            <p className="text-xs text-muted">
              {product.sku}{product.category ? ` · ${product.category}` : ""}
              {flag && <span className="sm:hidden"> · <span className={flag === "Agotado" ? "font-medium text-rose-700" : ""}>{flag}</span></span>}
            </p>
            {details && <p className="hidden text-xs text-muted sm:block">{details}</p>}
          </div>
        </div>
      </TableCell>
      <TableCell className="hidden whitespace-nowrap sm:table-cell">
        {!product.active ? <StatusDot tone="neutral">Archivado</StatusDot> : stock <= 0 ? <StatusDot tone="bad">Agotado</StatusDot> : <StatusDot tone="good">Activo</StatusDot>}
      </TableCell>
      <TableCell className="hidden text-right tabular-nums md:table-cell">{active.length}</TableCell>
      <TableCell className="hidden whitespace-nowrap text-right tabular-nums lg:table-cell">
        {product.price_wholesale != null
          ? <>{formatCOP(product.price_wholesale)}{product.wholesale_min_qty ? <span className="block text-[11px] text-muted">{product.wholesale_min_qty}+ u</span> : null}</>
          : <span className="text-muted">—</span>}
      </TableCell>
      <TableCell className="whitespace-nowrap text-right font-medium tabular-nums text-ink">{formatCOP(product.price_retail)}</TableCell>
      <TableCell className={cn("whitespace-nowrap px-4 text-right tabular-nums sm:px-5", stock <= 0 ? "font-medium text-rose-700" : "text-ink")}>{Math.max(stock, 0)}</TableCell>
    </TableRow>
  );
}
