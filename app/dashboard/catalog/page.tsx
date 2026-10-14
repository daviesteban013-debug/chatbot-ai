import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant } from "@/lib/auth";
import { PageHeader } from "@/components/dashboard/page-header";
import { CatalogManager } from "@/components/catalog/catalog-manager";
import type { CatalogProduct } from "@/lib/catalog/types";

export const metadata = { title: "Catálogo · Nexo.ai" };

export default async function CatalogPage() {
  const tenantContext = await getCurrentTenant();
  if (!tenantContext) redirect("/login");

  const supabase = await createClient();
  const { data: products } = await supabase
    .from("products")
    .select("id, sku, name, description, category, price_retail, price_wholesale, wholesale_min_qty, image_url, active, product_variants(id, sku, color, size, stock_qty, reserved_qty, price_override, image_url, active)")
    .eq("tenant_id", tenantContext.tenantId)
    .order("name", { ascending: true })
    .limit(2000);

  const rows: CatalogProduct[] = (products ?? []).map(({ product_variants, ...product }) => ({
    ...product,
    variants: (Array.isArray(product_variants) ? product_variants : []).sort((a, b) => a.sku.localeCompare(b.sku)),
  })) as CatalogProduct[];

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <PageHeader title="Catálogo" description="Los productos, fotos, precios y stock que NEXO ofrece a tus clientes por WhatsApp." />
      <CatalogManager products={rows} canEdit={tenantContext.role !== "viewer"} />
    </div>
  );
}
