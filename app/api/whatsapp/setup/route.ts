import { z } from "zod";
import { getCurrentTenant, getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { activateCloudPhone, cloudErrorMessage, verifyCloudPhone } from "@/lib/whatsapp/cloud";
import { encryptWhatsAppToken, loadWhatsAppSendOptions } from "@/lib/whatsapp/credentials";
import { readWhatsAppSetup, setupRequirements } from "@/lib/whatsapp/setup";

export const maxDuration = 60;
const id = z.string().regex(/^\d{5,30}$/);
const input = z.discriminatedUnion("operation",[
  z.object({operation:z.literal("save"),phoneId:id,wabaId:id,accessToken:z.string().trim().min(20).max(8192).regex(/^\S+$/)}).strict(),
  z.object({operation:z.literal("register"),pin:z.string().regex(/^\d{6}$/)}).strict(),
  z.object({operation:z.literal("subscribe")}).strict(),
]);
const json = (data:unknown,status=200) => Response.json(data,{status,headers:{"Cache-Control":"no-store"}});

export async function GET() {
  const user = await getCurrentUser();
  const tenant = await getCurrentTenant();
  if (!user || user.is_anonymous || !tenant) return json({error:"Inicia sesión para ver tu conexión."},401);
  try { return json(await readWhatsAppSetup(await createClient(),tenant.tenantId,tenant.role==="owner")); }
  catch { return json({error:"No pude consultar el estado de WhatsApp."},503); }
}

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return json({error:"Origen no permitido."},403);
  const user = await getCurrentUser();
  const tenant = await getCurrentTenant();
  if (!user || user.is_anonymous || !tenant) return json({error:"Vuelve a iniciar sesión."},401);
  if (tenant.role !== "owner") return json({error:"Solo el dueño del negocio puede configurar WhatsApp."},403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return json({error:"Formato no válido."},415);
  const raw = await request.text();
  if (raw.length > 18000) return json({error:"La solicitud es demasiado grande."},413);
  let payload:unknown;
  try { payload=JSON.parse(raw); } catch { return json({error:"Datos no válidos."},400); }
  const parsed=input.safeParse(payload);
  if (!parsed.success) return json({error:"Revisa los IDs, el token o el PIN. No incluyas otros campos."},400);
  if (setupRequirements().some(requirement=>!requirement.ready)) return json({error:"Falta preparar la aplicación de Meta o el cifrado en el servidor."},503);
  const admin=createAdminClient();
  try {
    if (parsed.data.operation === "save") {
      const {phoneId,wabaId,accessToken}=parsed.data;
      const phone=await verifyCloudPhone(wabaId,phoneId,accessToken);
      const {error}=await admin.rpc("configure_whatsapp_cloud",{
        p_tenant:tenant.tenantId,p_user:user.id,p_phone:phoneId,p_waba:wabaId,
        p_display:phone.display_phone_number,p_ciphertext:encryptWhatsAppToken(accessToken,tenant.tenantId,phoneId),
      });
      if (error) return json({error:error.code==="23505" ? "Ese número ya está vinculado a otro negocio." : "No pude guardar la conexión. Comprueba tus permisos e inténtalo de nuevo."},409);
      return json({ok:true,message:"Credenciales verificadas y guardadas. Completa el registro y prueba la recepción."});
    }
    // Read again using the current session's tenant; no IDs or actor from the body.
    const {data:account,error}=await admin.from("whatsapp_accounts").select("phone_number_id,waba_id")
      .eq("tenant_id",tenant.tenantId).maybeSingle();
    if (error || !account?.waba_id) return json({error:"Primero verifica y guarda las credenciales."},409);
    const options=await loadWhatsAppSendOptions(admin,tenant.tenantId,account.phone_number_id);
    if (!options) return json({error:"No pude leer las credenciales. Vuelve a guardar un token válido."},409);
    // Check owner again immediately before mutations on the external account.
    const {data:membership}=await admin.from("tenant_members").select("role")
      .eq("tenant_id",tenant.tenantId).eq("user_id",user.id).maybeSingle();
    if (membership?.role!=="owner") return json({error:"Ya no tienes permiso para configurar este negocio."},403);
    await activateCloudPhone(account.waba_id,account.phone_number_id,options.accessToken,
      parsed.data.operation==="register" ? parsed.data.pin : undefined);
    return json({ok:true,message:parsed.data.operation==="register"
      ? "Meta confirmó el registro y la suscripción. Envía un mensaje desde otro teléfono para comprobar la recepción."
      : "Aplicación suscrita. Comprueba el registro del número en Meta y envía un mensaje desde otro teléfono."});
  } catch (error) { return json({error:cloudErrorMessage(error)},502); }
}
