import type { LLMTool } from "@/lib/llm/types";
import type { WebToolContext } from "./web-tools";
import { proposalInput, proposalSchema, type OrderProposal } from "@/lib/order-proposals";
export function createOrderPreparation(ctx:WebToolContext & {userId?:string|null;sessionId:string}) {
  const proposals:OrderProposal[]=[];
  const enabled=Boolean(ctx.tenantId && ctx.userId && (ctx.role==="owner" || ctx.role==="agent"));
  const tools:LLMTool[]=enabled ? [{type:"function",function:{name:"prepare_order_proposal",
    description:"Prepara una propuesta de pedido minorista con precios y stock consultados en la base de datos. Usa customer_id confirmado y SKUs exactos del catálogo. NO registra el pedido ni reserva stock: requiere que el usuario pulse Confirmar pedido en la tarjeta. No acepta precios, permisos, envío ni descuentos. Sin envío ni cobro asignados; el registro confirmado queda como borrador para completar estos datos.",
    parameters:{type:"object",properties:{customer_id:{type:"string"},items:{type:"array",minItems:1,maxItems:10,items:{type:"object",properties:{variant_sku:{type:"string"},qty:{type:"integer",minimum:1,maximum:1000}},required:["variant_sku","qty"],additionalProperties:false}}},required:["customer_id","items"],additionalProperties:false}}}]:[];
  async function execute(args:Record<string,unknown>) {
    const parsed=proposalInput.safeParse(args);
    if (!enabled || !parsed.success) return {ok:false,error:"No puedes preparar este pedido o faltan un cliente y productos válidos."};
    ctx.signal?.throwIfAborted();
    const {data,error}=await ctx.supabase.rpc("nexo_prepare_order",{p_tenant:ctx.tenantId,p_user:ctx.userId!,p_session:ctx.sessionId,p_customer:parsed.data.customer_id,p_items:parsed.data.items}).abortSignal(ctx.signal??AbortSignal.timeout(10000));
    if(error) return {ok:false,error:"No pude preparar el pedido. Comprueba el cliente, los SKUs, las cantidades y el stock. No se creó pedido ni se reservó inventario."};
    const result=data as {ok?:boolean;proposal?:unknown}|null;
    const proposal=proposalSchema.safeParse(result?.proposal);
    if(!result?.ok || !proposal.success) return {ok:false,error:"No se pudo verificar la propuesta. No confirmes ningún pedido."};
    if(!proposals.some(value=>value.id===proposal.data.id)) proposals.push(proposal.data);
    return {ok:true,data:{proposal:proposal.data,requires_click_confirmation:true,order_created:false,stock_reserved:false}};
  }
  return {tools,proposals,execute};
}
