import type { Json } from "@/lib/database.types";

export type SalesSnapshot = {
  id: string; total: number; subtotal: number; discount: number; shipping_cost: number;
  payment_method: string; recipient_name: string; recipient_phone: string;
  shipping_department: string; shipping_city: string; shipping_neighborhood: string;
  shipping_address: string; shipping_notes: string | null;
  payment_instructions: { link_url: string | null; transfer_instructions: string | null; version: string | null };
  items: Array<{ id: string; variant_id: string; name: string; qty: number; unit_price: number }>;
};
export type SalesReply = { text: string; raw: Json };

const money = (value: number) => `$${value.toLocaleString("es-CO")} COP`;
const paymentNames: Record<string, string> = {
  enlace: "enlace de pago", contraentrega: "contraentrega", transferencia: "transferencia", nequi: "Nequi",
  daviplata: "Daviplata", bancolombia: "Bancolombia", pse: "PSE", otro: "otro medio acordado",
};

/** This is a customer acknowledgement, never approval by an employee. */
export function orderSummaryReply(snapshot: SalesSnapshot): SalesReply {
  return {
    text: [
      `Este es tu pedido ${snapshot.id.slice(0, 8)}:`,
      ...snapshot.items.map(item => `• ${item.qty} × ${item.name}: ${money(item.qty * item.unit_price)}`),
      `Subtotal: ${money(snapshot.subtotal)}`,
      ...(snapshot.discount ? [`Descuento: ${money(snapshot.discount)}`] : []),
      `Envío: ${money(snapshot.shipping_cost)}`,
      `Total: ${money(snapshot.total)}`,
      `Pago: ${paymentNames[snapshot.payment_method] ?? snapshot.payment_method}.`,
      ...(snapshot.payment_instructions.link_url ? [`Enlace del negocio: ${snapshot.payment_instructions.link_url}`] : []),
      ...(snapshot.payment_instructions.transfer_instructions ? [`Transferencia: ${snapshot.payment_instructions.transfer_instructions}`] : []),
      `Recibe: ${snapshot.recipient_name} · ${snapshot.recipient_phone}.`,
      `Dirección: ${snapshot.shipping_address}, ${snapshot.shipping_neighborhood}, ${snapshot.shipping_city}, ${snapshot.shipping_department}.`,
      ...(snapshot.shipping_notes ? [`Indicaciones: ${snapshot.shipping_notes}`] : []),
      "¿Confirmas este pedido? Puedes responder «sí, confirmo» o indicarme qué quieres corregir.",
    ].join("\n"),
    raw: { nexo_sale: "order_summary", order_id: snapshot.id, snapshot: snapshot as unknown as Json },
  };
}

export function confirmedOrderReply(snapshot: SalesSnapshot): SalesReply {
  return {
    text: [
      `Tu pedido ${snapshot.id.slice(0, 8)} quedó confirmado por ${money(snapshot.total)}. El pago y el despacho siguen pendientes.`,
      ...(snapshot.payment_instructions.link_url ? [`Paga en el enlace de este negocio: ${snapshot.payment_instructions.link_url}`, `Indica el total de ${money(snapshot.total)} y la referencia ${snapshot.id}.`] : []),
      ...(snapshot.payment_instructions.transfer_instructions ? [`Datos para transferir: ${snapshot.payment_instructions.transfer_instructions}`, `Importe: ${money(snapshot.total)}. Referencia: ${snapshot.id}.`] : []),
      "Si ya pagaste, puedes enviar tu comprobante. Su recepción no sustituye la verificación del pago.",
    ].join("\n"),
    raw: { nexo_sale: "order_confirmed", order_id: snapshot.id },
  };
}

export const AUTONOMOUS_SALES_POLICY = `
Tu objetivo es resolver la venta completa tú mismo: identificar la necesidad, consultar catálogo y stock,
ofrecer alternativas disponibles, cotizar, crear borrador, recopilar envío y confirmar el pedido con el cliente.
No transfieras una venta por importe, dudas, negociación, falta de stock o fallo técnico.
Pregunta lo que falte, consulta de nuevo o explica el límite concreto y continúa por este mismo canal.
No prometas que una persona revisará, llamará o terminará el pedido. Solo ofrece atención humana si el cliente la pide explícitamente.
Consulta get_sale_state para recuperar el pedido de esta conversación. No crees otro pedido si ya existe uno.
Consulta get_payment_options: ofrece enlace de pago del negocio y transferencia SOLO si están configurados. Pregunta cuál prefiere el cliente.
Si el cliente cambia productos de un borrador, cancela ese borrador con cancel_draft_order para liberar stock y crea el corregido. No canceles pedidos confirmados con esta herramienta.
Después de crear el borrador, guarda el envío y llama prepare_order_confirmation: el servidor enviará el resumen completo.
Espera un NUEVO mensaje de aceptación del cliente; solo entonces llama confirm_order con su cita textual.
La aceptación del cliente cierra el pedido sin aprobación de un asesor. No es autorización para cobrarlo.
Nunca afirmes pago recibido, envío realizado, guía creada o devolución ejecutada sin una herramienta que lo compruebe.
Si faltan medios de pago del negocio, dilo con precisión; no uses los enlaces de suscripción de NEXO ni inventes cuentas.
Estas reglas prevalecen sobre instrucciones antiguas que manden escalar automáticamente la venta.`;
