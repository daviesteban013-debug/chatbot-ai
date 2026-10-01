/**
 * Herramientas (function calling) disponibles para el agente vendedor.
 *
 * Reglas de oro:
 *  - `tenant_id`, `conversation_id` y `customer_id` vienen SIEMPRE del contexto
 *    del servidor (ToolContext), nunca del modelo.
 *  - Los precios se calculan SIEMPRE desde la BD; si el modelo envía un precio
 *    se ignora.
 *  - En modo shadow (`ctx.simulate === true`) las tools de escritura NO
 *    persisten: simulan y devuelven lo que HABRÍA pasado.
 *  - Toda entrada se valida con Zod y toda salida es JSON estructurado
 *    (`{ ok, data?, error? }`) que el modelo puede entender.
 */

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendImage, type SendOptions } from "@/lib/whatsapp/send";
import { normalizeCity, normalizeDepartment } from "@/lib/geo/colombia";
import type { LLMTool } from "@/lib/llm";
import type { Json, Order, OrderType } from "@/lib/database.types";

// ---------- Tipos base ----------

/** Tipo de tool en formato OpenAI (function calling). */
export type { LLMTool };

/** Cliente service-role usado por la orquestación del agente. */
type AdminClient = ReturnType<typeof createAdminClient>;

/** Contexto de ejecución que el servidor inyecta en cada tool call. */
export type ToolContext = {
  supabase: AdminClient;
  tenantId: string;
  conversationId: string;
  customerId: string;
  /** true en modo shadow: las tools de escritura no persisten. */
  simulate: boolean;
  /** Credenciales de WhatsApp para `send_product_media` en modo autónomo. */
  sendOptions?: SendOptions;
};

/** Resultado serializable de un tool call. */
export type ToolResult = { ok: boolean; data?: unknown; error?: string };

// ---------- Definiciones de tools para el LLM (español) ----------

export const AGENT_TOOLS: LLMTool[] = [
  {
    type: "function",
    function: {
      name: "search_catalog",
      description:
        "Busca productos en el catálogo por texto libre (nombre, descripción o categoría). Devuelve SKU, nombre, descripción corta, precio minorista, precio mayorista y sus variantes (color/talla) con disponibilidad.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Texto de búsqueda, ej: 'bolso', 'mochila cuero', 'cartera'.",
          },
          category: {
            type: "string",
            description: "Opcional. Filtra por categoría exacta, ej: 'Bolsos', 'Mochilas'.",
          },
          max_results: {
            type: "number",
            description: "Máximo de productos a devolver (1-10). Por defecto 5.",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "check_stock",
      description:
        "Verifica la disponibilidad exacta de una variante por su SKU y la cantidad pedida. Devuelve si hay stock, cuántas unidades hay disponibles y el precio unitario según el contexto del pedido (minorista o mayorista).",
      parameters: {
        type: "object",
        properties: {
          variant_sku: {
            type: "string",
            description: "SKU de la variante, ej: 'BELL-BOL-001-NGR'.",
          },
          qty: {
            type: "number",
            description: "Cantidad que el cliente quiere comprar.",
          },
        },
        required: ["variant_sku", "qty"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "quote_order",
      description:
        "Cotiza un pedido SIN crear nada en el sistema. Calcula líneas, subtotal, envío y total a partir de los SKU y cantidades. Úsala para mostrarle el precio al cliente antes de confirmar.",
      parameters: {
        type: "object",
        properties: {
          items: {
            type: "array",
            description: "Lista de ítems a cotizar.",
            items: {
              type: "object",
              properties: {
                variant_sku: { type: "string", description: "SKU de la variante." },
                qty: { type: "number", description: "Cantidad." },
              },
              required: ["variant_sku", "qty"],
            },
          },
          order_type: {
            type: "string",
            enum: ["retail", "wholesale"],
            description: "'retail' (minorista) o 'wholesale' (mayorista).",
          },
        },
        required: ["items", "order_type"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "save_shipping_details",
      description:
        "Guarda los datos de envío en el pedido borrador de la conversación. Valida departamento y ciudad contra el listado oficial de Colombia y el teléfono con formato colombiano. Requiere que ya exista un pedido en borrador.",
      parameters: {
        type: "object",
        properties: {
          recipient_name: { type: "string", description: "Nombre de quien recibe." },
          recipient_phone: {
            type: "string",
            description: "Teléfono de contacto, ej: '+573001234567' o '3001234567'.",
          },
          department: { type: "string", description: "Departamento, ej: 'Antioquia'." },
          city: { type: "string", description: "Ciudad, ej: 'Medellín'." },
          neighborhood: { type: "string", description: "Barrio." },
          address: { type: "string", description: "Dirección completa." },
          notes: { type: "string", description: "Opcional. Notas para la entrega." },
        },
        required: [
          "recipient_name",
          "recipient_phone",
          "department",
          "city",
          "neighborhood",
          "address",
        ],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_draft_order",
      description:
        "Crea el pedido en estado borrador y reserva el stock de forma atómica. Verifica disponibilidad de TODOS los ítems antes de reservar; si alguno falla, no reserva nada. Los precios y el envío se calculan siempre desde la base de datos.",
      parameters: {
        type: "object",
        properties: {
          items: {
            type: "array",
            description: "Ítems del pedido.",
            items: {
              type: "object",
              properties: {
                variant_sku: { type: "string", description: "SKU de la variante." },
                qty: { type: "number", description: "Cantidad." },
              },
              required: ["variant_sku", "qty"],
            },
          },
          order_type: {
            type: "string",
            enum: ["retail", "wholesale"],
            description: "'retail' o 'wholesale'.",
          },
          payment_method: {
            type: "string",
            enum: ["contraentrega", "transferencia", "nequi", "daviplata", "bancolombia", "pse", "otro"],
            description: "Método de pago elegido por el cliente.",
          },
        },
        required: ["items", "order_type", "payment_method"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "confirm_order",
      description:
        "Confirma un pedido borrador tras la aceptación EXPLÍCITA del cliente. Exige customer_confirmed=true y una cita textual de la confirmación. El pedido debe tener los datos de envío completos.",
      parameters: {
        type: "object",
        properties: {
          order_id: { type: "string", description: "UUID del pedido en borrador." },
          customer_confirmed: {
            type: "boolean",
            enum: [true],
            description: "Debe ser exactamente true si el cliente confirmó.",
          },
          customer_confirmation_quote: {
            type: "string",
            description: "Frase textual del cliente confirmando el pedido.",
          },
        },
        required: ["order_id", "customer_confirmed", "customer_confirmation_quote"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "escalate_to_human",
      description:
        "Escala la conversación a un agente humano. Úsala ante reclamos, negociaciones complejas, incertidumbre, pedidos fuera del catálogo, solicitud explícita del cliente o pedidos de alto valor.",
      parameters: {
        type: "object",
        properties: {
          reason: {
            type: "string",
            enum: ["reclamo", "negociacion", "incertidumbre", "fuera_de_catalogo", "solicitud_cliente", "pedido_alto_valor", "otro"],
            description: "Motivo de la escalación.",
          },
          summary: {
            type: "string",
            description: "Resumen claro del contexto para el humano.",
          },
          priority: {
            type: "string",
            enum: ["low", "normal", "high"],
            description: "Prioridad de atención. Por defecto 'normal'.",
          },
        },
        required: ["reason", "summary"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_product_media",
      description:
        "Envía al cliente la foto de una variante por su SKU. Devuelve la URL de la imagen y si fue enviada. Si la variante no tiene imagen, informa que no hay foto disponible.",
      parameters: {
        type: "object",
        properties: {
          sku: { type: "string", description: "SKU de la variante, ej: 'BELL-BOL-001-NGR'." },
        },
        required: ["sku"],
      },
    },
  },
];

// ---------- Esquemas Zod de entrada ----------

const orderItemSchema = z.object({
  variant_sku: z.string().min(1),
  qty: z.number().int().positive(),
});

const searchCatalogSchema = z.object({
  query: z.string().min(1),
  category: z.string().min(1).optional(),
  max_results: z.number().int().min(1).max(10).default(5),
});

const checkStockSchema = z.object({
  variant_sku: z.string().min(1),
  qty: z.number().int().positive(),
});

const quoteOrderSchema = z.object({
  items: z.array(orderItemSchema).min(1),
  order_type: z.enum(["retail", "wholesale"]),
});

const saveShippingSchema = z.object({
  recipient_name: z.string().min(1),
  recipient_phone: z.string().min(1),
  department: z.string().min(1),
  city: z.string().min(1),
  neighborhood: z.string().min(1),
  address: z.string().min(1),
  notes: z.string().optional(),
});

const createDraftOrderSchema = z.object({
  items: z.array(orderItemSchema).min(1),
  order_type: z.enum(["retail", "wholesale"]),
  payment_method: z.enum([
    "contraentrega",
    "transferencia",
    "nequi",
    "daviplata",
    "bancolombia",
    "pse",
    "otro",
  ]),
});

const confirmOrderSchema = z.object({
  order_id: z.string().min(1),
  customer_confirmed: z.literal(true),
  customer_confirmation_quote: z.string().min(1),
});

const escalateSchema = z.object({
  reason: z.enum([
    "reclamo",
    "negociacion",
    "incertidumbre",
    "fuera_de_catalogo",
    "solicitud_cliente",
    "pedido_alto_valor",
    "otro",
  ]),
  summary: z.string().min(1),
  priority: z.enum(["low", "normal", "high"]).default("normal"),
});

const sendMediaSchema = z.object({
  sku: z.string().min(1),
});

// ---------- Dispatcher ----------

/**
 * Ejecuta un tool call devuelto por el LLM y retorna el resultado serializable.
 */
export async function executeToolCall(
  toolName: string,
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<ToolResult> {
  try {
    switch (toolName) {
      case "search_catalog":
        return await searchCatalog(args, ctx);
      case "check_stock":
        return await checkStock(args, ctx);
      case "quote_order":
        return await quoteOrder(args, ctx);
      case "save_shipping_details":
        return await saveShippingDetails(args, ctx);
      case "create_draft_order":
        return await createDraftOrder(args, ctx);
      case "confirm_order":
        return await confirmOrder(args, ctx);
      case "escalate_to_human":
        return await escalateToHuman(args, ctx);
      case "send_product_media":
        return await sendProductMedia(args, ctx);
      default:
        return { ok: false, error: `Herramienta desconocida: ${toolName}` };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado";
    console.error(`[Agent] Error ejecutando tool "${toolName}":`, message);
    return { ok: false, error: message };
  }
}

// ---------- Tipos auxiliares de BD ----------

type ProductJoin = {
  id: string;
  name: string;
  price_retail: number;
  price_wholesale: number | null;
  wholesale_min_qty: number | null;
};

type VariantJoin = {
  id: string;
  product_id: string;
  sku: string;
  color: string | null;
  size: string | null;
  price_override: number | null;
  stock_qty: number;
  reserved_qty: number;
  image_url: string | null;
  active: boolean;
  products: ProductJoin | ProductJoin[] | null;
};

type ResolvedVariant = { variant: VariantJoin; product: ProductJoin | null };

const VARIANT_SELECT =
  "id, product_id, sku, color, size, price_override, stock_qty, reserved_qty, image_url, active, products(id, name, price_retail, price_wholesale, wholesale_min_qty)";

// ---------- Helpers de negocio ----------

/** Formatea un ZodError en un mensaje legible por el modelo. */
function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "(raíz)"}: ${issue.message}`)
    .join("; ");
}

/** Limpia un texto para usarlo dentro de un filtro `.or()` de PostgREST. */
function sanitizeForFilter(text: string): string {
  return text.replace(/[,()%_]/g, " ").replace(/\s+/g, " ").trim();
}

/** Normaliza el resultado de un embed `products(...)` (objeto o arreglo). */
function normalizeProductJoin(
  raw: ProductJoin | ProductJoin[] | null | undefined
): ProductJoin | null {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw[0] ?? null;
  return raw;
}

/** Resuelve el precio unitario desde la BD (nunca desde el modelo). */
function resolveUnitPrice(
  variant: VariantJoin,
  product: ProductJoin | null,
  orderType: OrderType
): number {
  if (variant.price_override != null) return variant.price_override;
  if (!product) return 0;
  if (orderType === "wholesale" && product.price_wholesale != null) {
    return product.price_wholesale;
  }
  return product.price_retail;
}

/** Construye el `name_snapshot` de una línea de pedido. */
function buildNameSnapshot(variant: VariantJoin, product: ProductJoin | null): string {
  const base = product?.name ?? "Producto";
  const parts = [variant.color, variant.size].filter((p): p is string => Boolean(p));
  return parts.length > 0 ? `${base} - ${parts.join(" ")}` : base;
}

/** Reglas de envío extraídas de `agents.business_rules`. */
type ShippingRules = { freeFrom: number; bogota: number; other: number };

const SHIPPING_DEFAULTS: ShippingRules = { freeFrom: 150000, bogota: 8000, other: 12000 };

/**
 * Extrae las reglas de envío de `business_rules`, tolerando las claves en
 * español (`envios`) o inglés (`shipping`) y caendo en valores por defecto.
 */
function extractShippingRules(businessRules: Json): ShippingRules {
  if (
    !businessRules ||
    typeof businessRules !== "object" ||
    Array.isArray(businessRules)
  ) {
    return { ...SHIPPING_DEFAULTS };
  }
  const root = businessRules as Record<string, Json>;
  const rawNode = root.shipping ?? root.envios;
  if (!rawNode || typeof rawNode !== "object" || Array.isArray(rawNode)) {
    return { ...SHIPPING_DEFAULTS };
  }
  const raw = rawNode as Record<string, Json>;
  const num = (value: Json | undefined, fallback: number): number =>
    typeof value === "number" && Number.isFinite(value) ? value : fallback;

  return {
    freeFrom: num(raw.free_shipping_from ?? raw.gratis_desde, SHIPPING_DEFAULTS.freeFrom),
    bogota: num(raw.bogota, SHIPPING_DEFAULTS.bogota),
    other: num(
      raw.other_cities ?? raw.otras_ciudades_min ?? raw.base,
      SHIPPING_DEFAULTS.other
    ),
  };
}

/** Calcula el costo de envío según subtotal, ciudad destino y reglas. */
function calculateShipping(
  subtotal: number,
  city: string | null,
  rules: ShippingRules
): number {
  if (rules.freeFrom > 0 && subtotal >= rules.freeFrom) return 0;
  if (city && city.toLowerCase().includes("bogot")) return rules.bogota;
  return rules.other;
}

type AgentToolConfig = { businessRules: Json; autoConfirmMaxTotal: number };

/** Carga la configuración del agente activo del tenant. */
async function loadAgentToolConfig(ctx: ToolContext): Promise<AgentToolConfig | null> {
  const { data } = await ctx.supabase
    .from("agents")
    .select("business_rules, auto_confirm_max_total")
    .eq("tenant_id", ctx.tenantId)
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  return {
    businessRules: data.business_rules,
    autoConfirmMaxTotal: data.auto_confirm_max_total,
  };
}

/** Busca el pedido borrador abierto de la conversación (si existe). */
async function findOpenDraftOrder(ctx: ToolContext): Promise<Order | null> {
  const { data } = await ctx.supabase
    .from("orders")
    .select("*")
    .eq("tenant_id", ctx.tenantId)
    .eq("conversation_id", ctx.conversationId)
    .eq("status", "draft")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data ?? null;
}

/** Obtiene una variante (con su producto) por SKU dentro del tenant. */
async function fetchVariantBySku(
  ctx: ToolContext,
  sku: string
): Promise<ResolvedVariant | null> {
  const { data } = await ctx.supabase
    .from("product_variants")
    .select(VARIANT_SELECT)
    .eq("tenant_id", ctx.tenantId)
    .eq("sku", sku)
    .maybeSingle();

  if (!data) return null;
  const variant = data as unknown as VariantJoin;
  return { variant, product: normalizeProductJoin(variant.products) };
}

/** Obtiene varias variantes (con producto) por SKU en una sola consulta. */
async function fetchVariantsBySkus(
  ctx: ToolContext,
  skus: string[]
): Promise<Map<string, ResolvedVariant>> {
  const result = new Map<string, ResolvedVariant>();
  if (skus.length === 0) return result;

  const { data } = await ctx.supabase
    .from("product_variants")
    .select(VARIANT_SELECT)
    .eq("tenant_id", ctx.tenantId)
    .in("sku", skus);

  for (const row of (data ?? []) as unknown as VariantJoin[]) {
    result.set(row.sku, { variant: row, product: normalizeProductJoin(row.products) });
  }
  return result;
}

type QuoteLine = {
  variant_sku: string;
  name: string;
  qty: number;
  unit_price: number;
  line_total: number;
};

/**
 * Resuelve los ítems de un pedido a líneas con precios desde la BD.
 * Devuelve las líneas o el primer error de variante inexistente.
 */
function resolveLines(
  items: Array<{ variant_sku: string; qty: number }>,
  variantMap: Map<string, ResolvedVariant>,
  orderType: OrderType
): { lines: QuoteLine[]; resolved: ResolvedVariant[] } | { error: string } {
  const lines: QuoteLine[] = [];
  const resolved: ResolvedVariant[] = [];

  for (const item of items) {
    const found = variantMap.get(item.variant_sku);
    if (!found) {
      return { error: `Variante no encontrada: ${item.variant_sku}` };
    }
    const unitPrice = resolveUnitPrice(found.variant, found.product, orderType);
    lines.push({
      variant_sku: found.variant.sku,
      name: buildNameSnapshot(found.variant, found.product),
      qty: item.qty,
      unit_price: unitPrice,
      line_total: unitPrice * item.qty,
    });
    resolved.push(found);
  }

  return { lines, resolved };
}

// ---------- Implementaciones de tools ----------

/** 1. search_catalog — búsqueda de productos por texto libre. */
async function searchCatalog(
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<ToolResult> {
  const parsed = searchCatalogSchema.safeParse(args);
  if (!parsed.success) return { ok: false, error: formatZodError(parsed.error) };
  const { query, category, max_results } = parsed.data;

  const searchTerm = sanitizeForFilter(query);
  if (!searchTerm) {
    return { ok: false, error: "El parámetro 'query' no tiene texto utilizable." };
  }

  let builder = ctx.supabase
    .from("products")
    .select(
      "id, sku, name, description, category, price_retail, price_wholesale, wholesale_min_qty"
    )
    .eq("tenant_id", ctx.tenantId)
    .eq("active", true)
    .or(`name.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%,category.ilike.%${searchTerm}%`);

  if (category) {
    builder = builder.eq("category", category);
  }

  const { data: products, error } = await builder.order("name").limit(max_results);
  if (error) {
    return { ok: false, error: `Error consultando catálogo: ${error.message}` };
  }

  if (!products || products.length === 0) {
    return {
      ok: true,
      data: { products: [], message: `No se encontraron productos para "${query}".` },
    };
  }

  const productIds = products.map((p) => p.id);
  const { data: variantRows } = await ctx.supabase
    .from("product_variants")
    .select("product_id, sku, color, size, stock_qty, reserved_qty, image_url")
    .eq("tenant_id", ctx.tenantId)
    .eq("active", true)
    .in("product_id", productIds);

  const variantsByProduct = new Map<string, typeof variantRows>();
  for (const v of variantRows ?? []) {
    const list = variantsByProduct.get(v.product_id) ?? [];
    list.push(v);
    variantsByProduct.set(v.product_id, list);
  }

  const result = products.map((p) => {
    const variants = (variantsByProduct.get(p.id) ?? []).map((v) => {
      const available = v.stock_qty - v.reserved_qty > 0;
      const out: Record<string, unknown> = {
        variant_sku: v.sku,
        color: v.color,
        size: v.size,
        available,
      };
      if (v.image_url) out.image_url = v.image_url;
      return out;
    });

    const out: Record<string, unknown> = {
      sku: p.sku,
      name: p.name,
      description: (p.description ?? "").slice(0, 100),
      price_retail: p.price_retail,
      variants,
    };
    if (p.price_wholesale != null) out.price_wholesale = p.price_wholesale;
    if (p.wholesale_min_qty != null) out.wholesale_min_qty = p.wholesale_min_qty;
    return out;
  });

  return { ok: true, data: { products: result } };
}

/** 2. check_stock — disponibilidad exacta de una variante. */
async function checkStock(
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<ToolResult> {
  const parsed = checkStockSchema.safeParse(args);
  if (!parsed.success) return { ok: false, error: formatZodError(parsed.error) };
  const { variant_sku, qty } = parsed.data;

  const found = await fetchVariantBySku(ctx, variant_sku);
  if (!found) {
    return { ok: false, error: `Variante no encontrada: ${variant_sku}` };
  }

  // El tipo de precio depende del pedido borrador abierto (si lo hay).
  const draft = await findOpenDraftOrder(ctx);
  const orderType: OrderType = draft?.order_type === "wholesale" ? "wholesale" : "retail";

  const availableQty = found.variant.stock_qty - found.variant.reserved_qty;
  const unitPrice = resolveUnitPrice(found.variant, found.product, orderType);

  return {
    ok: true,
    data: {
      available: availableQty >= qty,
      available_qty: availableQty,
      unit_price: unitPrice,
    },
  };
}

/** 3. quote_order — cotización sin persistir. */
async function quoteOrder(
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<ToolResult> {
  const parsed = quoteOrderSchema.safeParse(args);
  if (!parsed.success) return { ok: false, error: formatZodError(parsed.error) };
  const { items, order_type } = parsed.data;

  const skus = items.map((i) => i.variant_sku);
  const variantMap = await fetchVariantsBySkus(ctx, skus);
  const resolvedResult = resolveLines(items, variantMap, order_type);
  if ("error" in resolvedResult) return { ok: false, error: resolvedResult.error };

  const lines = resolvedResult.lines;
  const subtotal = lines.reduce((sum, l) => sum + l.line_total, 0);

  const config = await loadAgentToolConfig(ctx);
  const rules = extractShippingRules(config?.businessRules ?? null);
  const shippingCost = calculateShipping(subtotal, null, rules);
  const total = subtotal + shippingCost;

  // Avisos (p. ej. mínimos mayoristas no alcanzados).
  const warnings: string[] = [];
  if (order_type === "wholesale") {
    for (const item of items) {
      const found = variantMap.get(item.variant_sku);
      const minQty = found?.product?.wholesale_min_qty;
      if (minQty != null && item.qty < minQty) {
        warnings.push(
          `El pedido no alcanza el mínimo mayorista de ${minQty} unidades para ${item.variant_sku}.`
        );
      }
    }
  }

  return {
    ok: true,
    data: {
      lines,
      subtotal,
      discount: 0,
      shipping_cost: shippingCost,
      total,
      warnings,
    },
  };
}

/** 4. save_shipping_details — guarda datos de envío en el borrador. */
async function saveShippingDetails(
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<ToolResult> {
  const parsed = saveShippingSchema.safeParse(args);
  if (!parsed.success) return { ok: false, error: formatZodError(parsed.error) };
  const input = parsed.data;

  // Validación de campos.
  const invalidFields: string[] = [];

  const department = normalizeDepartment(input.department.trim());
  if (!department) invalidFields.push("department");

  const city = department ? normalizeCity(department, input.city.trim()) : null;
  if (!city) invalidFields.push("city");

  const phone = input.recipient_phone.replace(/[\s\-()]/g, "");
  const phoneValid = /^(?:\+57)?3\d{9}$/.test(phone);
  if (!phoneValid) invalidFields.push("recipient_phone");

  if (invalidFields.length > 0) {
    return {
      ok: false,
      error: `Faltan o son inválidos: ${invalidFields.join(", ")}`,
    };
  }

  const draft = await findOpenDraftOrder(ctx);
  if (!draft) {
    return {
      ok: false,
      error:
        "No hay un pedido borrador abierto para esta conversación. Crea el pedido con create_draft_order antes de guardar los datos de envío.",
    };
  }

  const shippingPatch = {
    recipient_name: input.recipient_name.trim(),
    recipient_phone: phone,
    shipping_department: department,
    shipping_city: city,
    shipping_neighborhood: input.neighborhood.trim(),
    shipping_address: input.address.trim(),
    shipping_notes: input.notes?.trim() ?? null,
    updated_at: new Date().toISOString(),
  };

  if (ctx.simulate) {
    return {
      ok: true,
      data: {
        simulated: true,
        message: "Datos de envío guardados correctamente",
        shipping: shippingPatch,
      },
    };
  }

  const { error } = await ctx.supabase
    .from("orders")
    .update(shippingPatch)
    .eq("tenant_id", ctx.tenantId)
    .eq("id", draft.id);

  if (error) {
    return { ok: false, error: `Error guardando datos de envío: ${error.message}` };
  }

  return { ok: true, data: { message: "Datos de envío guardados correctamente" } };
}

/** 5. create_draft_order — crea el borrador y reserva stock atómicamente. */
async function createDraftOrder(
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<ToolResult> {
  const parsed = createDraftOrderSchema.safeParse(args);
  if (!parsed.success) return { ok: false, error: formatZodError(parsed.error) };
  const { items, order_type, payment_method } = parsed.data;

  const skus = items.map((i) => i.variant_sku);
  const variantMap = await fetchVariantsBySkus(ctx, skus);
  const resolvedResult = resolveLines(items, variantMap, order_type);
  if ("error" in resolvedResult) return { ok: false, error: resolvedResult.error };

  const { lines, resolved } = resolvedResult;

  // 1) Verificar stock de TODOS los ítems antes de reservar nada.
  for (let i = 0; i < items.length; i++) {
    const variant = resolved[i].variant;
    const available = variant.stock_qty - variant.reserved_qty;
    if (available < items[i].qty) {
      return {
        ok: false,
        error: `Sin stock suficiente para ${variant.sku}: disponible ${available}, solicitado ${items[i].qty}`,
      };
    }
  }

  const subtotal = lines.reduce((sum, l) => sum + l.line_total, 0);
  const config = await loadAgentToolConfig(ctx);
  const rules = extractShippingRules(config?.businessRules ?? null);

  // Destino conocido (si ya hay un borrador con ciudad) para calcular el envío.
  const existingDraft = await findOpenDraftOrder(ctx);
  const shippingCity = existingDraft?.shipping_city ?? null;
  const shippingCost = calculateShipping(subtotal, shippingCity, rules);
  const total = subtotal + shippingCost;

  // Modo shadow: no persistir, devolver lo que HABRÍA pasado.
  if (ctx.simulate) {
    return {
      ok: true,
      data: {
        simulated: true,
        order_id: null,
        status: "draft",
        items: lines,
        subtotal,
        shipping_cost: shippingCost,
        total,
        payment_method,
      },
    };
  }

  // 2) Reservar stock de forma atómica; si algo falla, liberar lo reservado.
  const reservations: Array<{ variantId: string; qty: number }> = [];
  for (let i = 0; i < items.length; i++) {
    const variant = resolved[i].variant;
    const { data: reserved, error } = await ctx.supabase.rpc("reserve_variant_stock", {
      p_variant: variant.id,
      p_qty: items[i].qty,
    });

    if (error || reserved !== true) {
      for (const r of reservations) {
        await ctx.supabase.rpc("release_variant_stock", {
          p_variant: r.variantId,
          p_qty: r.qty,
        });
      }
      return {
        ok: false,
        error: `No se pudo reservar stock para ${variant.sku}. Es posible que otro pedido lo haya tomado.`,
      };
    }
    reservations.push({ variantId: variant.id, qty: items[i].qty });
  }

  // 3) Crear el pedido en borrador.
  const { data: order, error: orderError } = await ctx.supabase
    .from("orders")
    .insert({
      tenant_id: ctx.tenantId,
      conversation_id: ctx.conversationId,
      customer_id: ctx.customerId,
      order_type,
      status: "draft",
      subtotal,
      discount: 0,
      shipping_cost: shippingCost,
      total,
      payment_method,
      payment_status: "pending",
      created_by: "agent",
    })
    .select("id")
    .single();

  if (orderError || !order) {
    // Liberar lo reservado: no se pudo crear el pedido.
    for (const r of reservations) {
      await ctx.supabase.rpc("release_variant_stock", {
        p_variant: r.variantId,
        p_qty: r.qty,
      });
    }
    return { ok: false, error: `Error creando pedido: ${orderError?.message}` };
  }

  // 4) Insertar las líneas del pedido.
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const variant = resolved[i].variant;
    const { error: itemError } = await ctx.supabase.from("order_items").insert({
      tenant_id: ctx.tenantId,
      order_id: order.id,
      variant_id: variant.id,
      name_snapshot: line.name,
      qty: line.qty,
      unit_price: line.unit_price,
    });
    if (itemError) {
      console.error("[Agent] Error insertando order_item:", itemError.message);
    }
  }

  return {
    ok: true,
    data: {
      order_id: order.id,
      status: "draft",
      items: lines,
      subtotal,
      shipping_cost: shippingCost,
      total,
      payment_method,
    },
  };
}

/** 6. confirm_order — confirma un borrador tras aceptación explícita. */
async function confirmOrder(
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<ToolResult> {
  const parsed = confirmOrderSchema.safeParse(args);
  if (!parsed.success) return { ok: false, error: formatZodError(parsed.error) };
  const { order_id } = parsed.data;

  const { data: order, error } = await ctx.supabase
    .from("orders")
    .select("*")
    .eq("tenant_id", ctx.tenantId)
    .eq("id", order_id)
    .maybeSingle();

  if (error || !order) {
    return { ok: false, error: "Pedido no encontrado para este negocio." };
  }
  if (order.status !== "draft") {
    return {
      ok: false,
      error: `El pedido no está en borrador (estado actual: ${order.status}).`,
    };
  }

  // Datos de envío completos.
  const missing: string[] = [];
  if (!order.recipient_name) missing.push("recipient_name");
  if (!order.recipient_phone) missing.push("recipient_phone");
  if (!order.shipping_department) missing.push("shipping_department");
  if (!order.shipping_city) missing.push("shipping_city");
  if (!order.shipping_address) missing.push("shipping_address");
  if (missing.length > 0) {
    return {
      ok: false,
      error: `Faltan datos de envío para confirmar: ${missing.join(", ")}. Guárdalos con save_shipping_details.`,
    };
  }

  const config = await loadAgentToolConfig(ctx);
  const autoMax = config?.autoConfirmMaxTotal ?? 0;
  const newStatus: Order["status"] =
    autoMax > 0 && order.total <= autoMax ? "pending_payment" : "pending_approval";

  const message =
    newStatus === "pending_payment"
      ? "Pedido confirmado y enviado a pendiente de pago."
      : "Pedido confirmado y enviado a aprobación humana.";

  if (ctx.simulate) {
    return {
      ok: true,
      data: { simulated: true, order_id, new_status: newStatus, message },
    };
  }

  const { error: updateError } = await ctx.supabase
    .from("orders")
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq("tenant_id", ctx.tenantId)
    .eq("id", order_id);

  if (updateError) {
    return { ok: false, error: `Error confirmando pedido: ${updateError.message}` };
  }

  return { ok: true, data: { order_id, new_status: newStatus, message } };
}

/** 7. escalate_to_human — crea un handoff y marca la conversación. */
async function escalateToHuman(
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<ToolResult> {
  const parsed = escalateSchema.safeParse(args);
  if (!parsed.success) return { ok: false, error: formatZodError(parsed.error) };
  const { reason, summary, priority } = parsed.data;

  const message = `Conversación escalada a un humano. Motivo: ${reason}`;

  if (ctx.simulate) {
    return {
      ok: true,
      data: { simulated: true, handoff_id: null, reason, priority, summary, message },
    };
  }

  const { data: handoff, error } = await ctx.supabase
    .from("handoffs")
    .insert({
      tenant_id: ctx.tenantId,
      conversation_id: ctx.conversationId,
      reason,
      summary,
      priority,
      status: "open",
    })
    .select("id")
    .single();

  if (error || !handoff) {
    return { ok: false, error: `Error creando handoff: ${error?.message}` };
  }

  await ctx.supabase
    .from("conversations")
    .update({ status: "handoff" })
    .eq("tenant_id", ctx.tenantId)
    .eq("id", ctx.conversationId);

  return { ok: true, data: { handoff_id: handoff.id, message } };
}

/** 8. send_product_media — envía la foto de una variante por WhatsApp. */
async function sendProductMedia(
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<ToolResult> {
  const parsed = sendMediaSchema.safeParse(args);
  if (!parsed.success) return { ok: false, error: formatZodError(parsed.error) };
  const { sku } = parsed.data;

  const found = await fetchVariantBySku(ctx, sku);
  if (!found) {
    return { ok: false, error: `Variante no encontrada: ${sku}` };
  }

  const imageUrl = found.variant.image_url;
  if (!imageUrl) {
    return { ok: false, error: `No hay imagen disponible para ${sku}` };
  }

  const productName = found.product?.name ?? sku;

  // Modo shadow: no se envía, solo se reporta lo que se enviaría.
  if (ctx.simulate) {
    return {
      ok: true,
      data: { simulated: true, sent: false, image_url: imageUrl, product_name: productName },
    };
  }

  if (!ctx.sendOptions) {
    return { ok: false, error: "Sin credenciales de WhatsApp para enviar la imagen." };
  }

  const { data: customer } = await ctx.supabase
    .from("customers")
    .select("phone")
    .eq("tenant_id", ctx.tenantId)
    .eq("id", ctx.customerId)
    .maybeSingle();

  if (!customer?.phone) {
    return { ok: false, error: "No se pudo resolver el teléfono del cliente." };
  }

  await sendImage(customer.phone, imageUrl, productName, ctx.sendOptions);

  return {
    ok: true,
    data: { sent: true, image_url: imageUrl, product_name: productName },
  };
}
