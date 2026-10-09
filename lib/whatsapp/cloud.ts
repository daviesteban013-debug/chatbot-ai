export const GRAPH_API_VERSION = process.env.WHATSAPP_GRAPH_VERSION?.trim() || "v26.0";
export function graphBaseUrl(): string {
  if (!/^v\d{2}\.0$/.test(GRAPH_API_VERSION)) throw new Error("WHATSAPP_INVALID_GRAPH_VERSION");
  return `https://graph.facebook.com/${GRAPH_API_VERSION}`;
}

export class CloudSetupError extends Error {
  constructor(public code: string) { super(code); }
}
export type CloudPhone = { id: string; display_phone_number: string; verified_name?: string; code_verification_status?: string };
type GraphResult = { data?: CloudPhone[]; success?: boolean; error?: {code?:number} };

async function graphRequest<T = GraphResult>(path: string, token: string, body?: Record<string,string>): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${graphBaseUrl()}/${path}`, {
      method: body ? "POST" : "GET", cache:"no-store", signal:AbortSignal.timeout(12_000),
      headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},
      ...(body ? {body:JSON.stringify(body)} : {}),
    });
  } catch { throw new CloudSetupError("META_UNAVAILABLE"); }
  const data = await response.json().catch(()=>({})) as GraphResult;
  if (!response.ok || data.error) {
    // Raw Graph errors can include submitted credentials. Return codes only.
    if (data.error?.code === 190) throw new CloudSetupError("TOKEN_INVALID");
    if (response.status === 429 || data.error?.code === 4 || data.error?.code === 80007) throw new CloudSetupError("META_RATE_LIMITED");
    throw new CloudSetupError("META_PERMISSION_OR_ASSET");
  }
  return data as T;
}

export async function verifyCloudPhone(wabaId: string, phoneId: string, token: string): Promise<CloudPhone> {
  if (!/^\d{5,30}$/.test(wabaId) || !/^\d{5,30}$/.test(phoneId)) throw new CloudSetupError("INVALID_IDS");
  const appId = process.env.WHATSAPP_APP_ID?.trim();
  const secret = process.env.WHATSAPP_APP_SECRET?.trim();
  if (!appId || !secret) throw new CloudSetupError("APP_NOT_CONFIGURED");
  const inspected = await graphRequest<{data?:{is_valid?:boolean;app_id?:string;scopes?:string[]}}>(
    `debug_token?input_token=${encodeURIComponent(token)}`,`${appId}|${secret}`,
  );
  if (!inspected.data?.is_valid || inspected.data.app_id !== appId) throw new CloudSetupError("TOKEN_WRONG_APP");
  if (!["whatsapp_business_management","whatsapp_business_messaging"].every(scope=>inspected.data?.scopes?.includes(scope))) {
    throw new CloudSetupError("META_PERMISSION_OR_ASSET");
  }
  const result = await graphRequest(`${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name,code_verification_status&limit=100`,token);
  const phone = result.data?.find(item=>item.id===phoneId);
  if (!phone || typeof phone.display_phone_number !== "string") throw new CloudSetupError("NUMBER_NOT_IN_WABA");
  if (phone.code_verification_status !== "VERIFIED") throw new CloudSetupError("NUMBER_NOT_VERIFIED");
  return phone;
}

/** Explicit owner action; does not send any customer message. */
export async function activateCloudPhone(wabaId: string, phoneId: string, token: string, pin?: string): Promise<void> {
  if (pin !== undefined && !/^\d{6}$/.test(pin)) throw new CloudSetupError("INVALID_PIN");
  await verifyCloudPhone(wabaId,phoneId,token);
  if (pin !== undefined) {
    const registration = await graphRequest(`${phoneId}/register`,token,{messaging_product:"whatsapp",pin});
    if (registration.success !== true) throw new CloudSetupError("REGISTRATION_FAILED");
  }
  const subscription = await graphRequest(`${wabaId}/subscribed_apps`,token,{});
  if (subscription.success !== true) throw new CloudSetupError("SUBSCRIPTION_FAILED");
}

export const cloudErrorMessage = (error: unknown): string => {
  const messages: Record<string,string> = {
    TOKEN_INVALID:"Meta rechazó el token o ya caducó. Genera uno válido en tu aplicación.",
    TOKEN_WRONG_APP:"El token no es válido o pertenece a otra aplicación de Meta. Usa la app configurada para NEXO.",
    APP_NOT_CONFIGURED:"Falta configurar la aplicación de Meta en el servidor de NEXO.",
    META_UNAVAILABLE:"Meta no respondió. Inténtalo de nuevo en un momento.",
    META_RATE_LIMITED:"Meta está limitando las consultas. Espera antes de reintentar.",
    META_PERMISSION_OR_ASSET:"Revisa los IDs y los permisos whatsapp_business_management y whatsapp_business_messaging del token.",
    NUMBER_NOT_IN_WABA:"Ese número no aparece en la cuenta de WhatsApp Business indicada. Revisa ambos IDs.",
    NUMBER_NOT_VERIFIED:"Primero verifica tu SIM por SMS o llamada en Meta.",
    INVALID_IDS:"Introduce los IDs numéricos de Meta; el Phone Number ID no es tu número de celular.",
    INVALID_PIN:"El PIN de verificación en dos pasos debe tener 6 dígitos; no es el código SMS.",
    REGISTRATION_FAILED:"Meta no confirmó el registro del número. Revisa su estado en WhatsApp Manager.",
    SUBSCRIPTION_FAILED:"El número se registró, pero falta suscribir la aplicación a los webhooks. Revisa Meta antes de reintentar.",
  };
  return error instanceof CloudSetupError ? messages[error.code] ?? "No se pudo completar la conexión con Meta." : "No se pudo completar la operación. Inténtalo de nuevo.";
};
