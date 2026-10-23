import { z } from "zod";
import { getCurrentTenant, getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { activateCloudPhone, cloudErrorMessage, CloudSetupError, exchangeSignupCode, generateTwoStepPin, onlyCloudPhoneId, requestAppDataSync, verifyCloudPhone } from "@/lib/whatsapp/cloud";
import { encryptWhatsAppToken, loadWhatsAppSendOptions } from "@/lib/whatsapp/credentials";
import { APP_SYNC_WINDOW_MS, readWhatsAppSetup, setupRequirements, signupConfig } from "@/lib/whatsapp/setup";

export const maxDuration = 60;
const id = z.string().regex(/^\d{5,30}$/);
const input = z.discriminatedUnion("operation",[
  z.object({operation:z.literal("save"),phoneId:id,wabaId:id,accessToken:z.string().trim().min(20).max(8192).regex(/^\S+$/)}).strict(),
  // Meta's button: a one-time code plus the IDs the signup window posted back. Never a token.
  // `coexistence`: the owner linked the WhatsApp Business app on their phone; Meta may then send only the account ID.
  z.object({operation:z.literal("signup"),code:z.string().trim().min(10).max(1024).regex(/^[A-Za-z0-9_#.-]+$/),phoneId:id.optional(),wabaId:id,coexistence:z.boolean().optional()}).strict(),
  z.object({operation:z.literal("register"),pin:z.string().regex(/^\d{6}$/)}).strict(),
  z.object({operation:z.literal("subscribe")}).strict(),
  // Retry asking Meta for the linked app's contacts and chats, inside its 24-hour window.
  z.object({operation:z.literal("sync")}).strict(),
]);
const json = (data:unknown,status=200) => Response.json(data,{status,headers:{"Cache-Control":"no-store"}});
type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Asks Meta, in order, for the linked WhatsApp Business app's contacts and then its chats, skipping what was
 * already asked (Meta takes each once), and records each request. Returns whether both are now requested.
 */
async function requestAppSync(admin:AdminClient,tenantId:string,phoneId:string,token:string):Promise<boolean> {
  const {data:account}=await admin.from("whatsapp_accounts").select("contacts_sync_requested_at,history_sync_requested_at")
    .eq("tenant_id",tenantId).eq("phone_number_id",phoneId).maybeSingle();
  let complete=true;
  // Contacts first, so the imported chats already carry the names the business saved.
  for (const syncType of ["smb_app_state_sync","history"] as const) {
    if (syncType==="history" ? account?.history_sync_requested_at : account?.contacts_sync_requested_at) continue;
    try {
      await requestAppDataSync(phoneId,token,syncType);
      const now=new Date().toISOString();
      await admin.from("whatsapp_accounts").update(syncType==="history" ? {history_sync_requested_at:now} : {contacts_sync_requested_at:now})
        .eq("tenant_id",tenantId).eq("phone_number_id",phoneId);
    } catch (error) { complete=false; console.error(`[whatsapp] Meta no aceptó el pedido ${syncType}:`,cloudErrorMessage(error)); }
  }
  return complete;
}

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
    if (parsed.data.operation === "signup") {
      if (!signupConfig()) return json({error:"La conexión en un clic no está habilitada en este servidor."},503);
      const {code,wabaId}=parsed.data, coexistence=parsed.data.coexistence===true;
      // Checked before the one-time code is spent: a new number always comes with its ID.
      if (!parsed.data.phoneId && !coexistence) return json({error:"Meta no indicó qué número conectar. Vuelve a pulsar el botón y termina todos los pasos."},400);
      const accessToken=await exchangeSignupCode(code);
      const phoneId=parsed.data.phoneId ?? await onlyCloudPhoneId(wabaId,accessToken);
      // A linked WhatsApp Business app is confirmed by Meta in the app itself, not by an SMS code.
      const phone=await verifyCloudPhone(wabaId,phoneId,accessToken,{requireVerified:!coexistence});
      const {error}=await admin.rpc("configure_whatsapp_cloud",{
        p_tenant:tenant.tenantId,p_user:user.id,p_phone:phoneId,p_waba:wabaId,
        p_display:phone.display_phone_number,p_ciphertext:encryptWhatsAppToken(accessToken,tenant.tenantId,phoneId),
      });
      if (error) return json({error:error.code==="23505" ? "Ese número ya está vinculado a otro negocio." : "No pude guardar la conexión. Comprueba tus permisos e inténtalo de nuevo."},409);
      if (coexistence) {
        // Meta already registered the number for the app and the API together; registering again could undo that. Subscribe only.
        await activateCloudPhone(wabaId,phoneId,accessToken,undefined,{requireVerified:false});
        // Linking opens Meta's 24-hour window to bring the app's contacts and chats; a new link starts it over.
        await admin.from("whatsapp_accounts").update({app_linked_at:new Date().toISOString(),contacts_sync_requested_at:null,
          history_sync_requested_at:null,history_sync_progress:null,history_sync_declined:false}).eq("tenant_id",tenant.tenantId).eq("phone_number_id",phoneId);
        const synced=await requestAppSync(admin,tenant.tenantId,phoneId,accessToken);
        return json({ok:true,message:`Listo: ${phone.display_phone_number} quedó conectado a Zorax y sigue funcionando en tu app de WhatsApp Business. ${synced
          ? "Estamos trayendo tus contactos y tus chats de los últimos 6 meses; aparecerán en Conversaciones en unos minutos."
          : "No pude pedirle a Meta tus chats: pulsa «Traer mis chats» en esta página antes de 24 horas."} Escríbele desde otro teléfono para probar la recepción.`});
      }
      // Register with a PIN Zorax generates and keeps encrypted; a number that already has one is linked
      // and subscribed anyway, and the owner finishes with their PIN.
      const pin=generateTwoStepPin();
      try {
        await activateCloudPhone(wabaId,phoneId,accessToken,pin);
      } catch (activation) {
        if (!(activation instanceof CloudSetupError)) throw activation;
        // Numbers that keep the WhatsApp Business app (coexistence) are already registered by Meta, and some
        // have their own PIN: link and subscribe anyway, and say what, if anything, is left to the owner.
        await activateCloudPhone(wabaId,phoneId,accessToken);
        if (activation.code==="PIN_MISMATCH") return json({ok:true,pinPending:true,message:`${phone.display_phone_number} quedó vinculado a Zorax. Ese número ya tiene un PIN de verificación en dos pasos: escríbelo en «Registrar» para terminar.`});
        return json({ok:true,message:`Listo: ${phone.display_phone_number} quedó conectado a Zorax y la app suscrita. Envía un mensaje desde otro teléfono para probar la recepción.`});
      }
      await admin.from("whatsapp_accounts").update({two_step_pin_enc:encryptWhatsAppToken(pin,tenant.tenantId,phoneId)}).eq("tenant_id",tenant.tenantId).eq("phone_number_id",phoneId);
      return json({ok:true,pin,message:`Listo: ${phone.display_phone_number} quedó conectado a Zorax. Guarda este PIN de verificación en dos pasos: ${pin}. Envía un mensaje desde otro teléfono para probar la recepción.`});
    }
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
    const {data:account,error}=await admin.from("whatsapp_accounts").select("phone_number_id,waba_id,app_linked_at")
      .eq("tenant_id",tenant.tenantId).maybeSingle();
    if (error || !account?.waba_id) return json({error:"Primero verifica y guarda las credenciales."},409);
    if (parsed.data.operation === "sync") {
      if (!account.app_linked_at) return json({error:"Solo se pueden traer los chats de un número vinculado desde la app de WhatsApp Business."},409);
      if (Date.now()-Date.parse(account.app_linked_at) > APP_SYNC_WINDOW_MS) return json({error:"Pasaron más de 24 horas desde que vinculaste la app. Para traer tus chats, desvincula Zorax en la app de WhatsApp Business y vuelve a conectarla."},409);
    }
    const options=await loadWhatsAppSendOptions(admin,tenant.tenantId,account.phone_number_id);
    if (!options) return json({error:"No pude leer las credenciales. Vuelve a guardar un token válido."},409);
    // Check owner again immediately before mutations on the external account.
    const {data:membership}=await admin.from("tenant_members").select("role")
      .eq("tenant_id",tenant.tenantId).eq("user_id",user.id).maybeSingle();
    if (membership?.role!=="owner") return json({error:"Ya no tienes permiso para configurar este negocio."},403);
    if (parsed.data.operation === "sync") {
      const synced=await requestAppSync(admin,tenant.tenantId,account.phone_number_id,options.accessToken);
      return synced ? json({ok:true,message:"Listo: Meta enviará tus contactos y tus chats en unos minutos; aparecerán en Conversaciones."})
        : json({error:"Meta no aceptó el pedido. Inténtalo de nuevo en un momento."},502);
    }
    await activateCloudPhone(account.waba_id,account.phone_number_id,options.accessToken,
      parsed.data.operation==="register" ? parsed.data.pin : undefined);
    return json({ok:true,message:parsed.data.operation==="register"
      ? "Meta confirmó el registro y la suscripción. Envía un mensaje desde otro teléfono para comprobar la recepción."
      : "Aplicación suscrita. Comprueba el registro del número en Meta y envía un mensaje desde otro teléfono."});
  } catch (error) { return json({error:cloudErrorMessage(error)},502); }
}
