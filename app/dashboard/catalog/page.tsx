import { redirect } from "next/navigation";
import { Package } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { formatCOP } from "@/lib/utils";

type VariantShape = { stock_qty: number; active: boolean };

export default async function CatalogPage() {
  const tenantContext = await getCurrentTenant();
  if (!tenantContext) redirect("/login");

  const supabase = await createClient();
  const tenantId = tenantContext.tenantId;

  const { data: products } = await supabase
    .from("products")
    .select(
      "id, sku, name, category, price_retail, price_wholesale, wholesale_min_qty, active, product_variants(id, stock_qty, active)"
    )
    .eq("tenant_id", tenantId)
    .order("name", { ascending: true });

  const rows = (products ?? []).map((product) => {
    const variants = Array.isArray(product.product_variants)
      ? (product.product_variants as VariantShape[])
      : [];
    const totalStock = variants.reduce((sum, v) => sum + (v.stock_qty ?? 0), 0);
    return { product, variantCount: variants.length, totalStock };
  });

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <PageHeader
        title="Catálogo"
        description="Productos, precios y existencias disponibles para el agente."
      />

      {rows.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map(({ product, variantCount, totalStock }) => (
            <article
              key={product.id}
              className="flex flex-col rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/40 transition hover:border-slate-300 hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-semibold text-slate-950">
                    {product.name}
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-400">
                    SKU {product.sku}
                    {product.category ? ` · ${product.category}` : ""}
                  </p>
                </div>
                {!product.active ? (
                  <Badge variant="neutral">Inactivo</Badge>
                ) : null}
              </div>

              <div className="mt-4 flex items-end gap-2">
                <span className="text-xl font-semibold tracking-tight text-slate-950">
                  {formatCOP(product.price_retail)}
                </span>
                <span className="pb-0.5 text-xs text-slate-400">minorista</span>
              </div>

              {product.price_wholesale != null ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Badge variant="info">
                    Mayorista {formatCOP(product.price_wholesale)}
                  </Badge>
                  {product.wholesale_min_qty ? (
                    <span className="text-xs text-slate-500">
                      mín. {product.wholesale_min_qty} u
                    </span>
                  ) : null}
                </div>
              ) : null}

              <div className="mt-auto flex items-center justify-between border-t border-slate-100 pt-4 text-xs text-slate-500">
                <span className="inline-flex items-center gap-1.5">
                  <Package className="size-3.5 text-slate-400" />
                  {variantCount} {variantCount === 1 ? "variante" : "variantes"}
                </span>
                <span
                  className={
                    totalStock === 0
                      ? "font-medium text-rose-600"
                      : "font-medium text-slate-700"
                  }
                >
                  {totalStock} en stock
                </span>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Package}
          title="Catálogo vacío"
          description="Agrega productos para que el agente pueda ofrecerlos en WhatsApp."
        />
      )}
    </div>
  );
}
