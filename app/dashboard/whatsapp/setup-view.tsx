"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowRight, Check, ExternalLink, MessageCircle, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/dashboard/page-header";
import { Panel, PanelHeader } from "@/components/dashboard/panel";
import type { WhatsAppSetup, WhatsAppSignupConfig } from "@/lib/whatsapp/setup";

type FacebookLoginResponse = { status?: string; authResponse?: { code?: string } | null };
type FacebookSdk = {
  init(options: { appId: string; autoLogAppEvents: boolean; xfbml: boolean; version: string }): void;
  login(callback: (response: FacebookLoginResponse) => void, options: Record<string, unknown>): void;
};
declare global { interface Window { FB?: FacebookSdk; fbAsyncInit?: () => void } }

const SDK_ID = "facebook-jssdk";
const META_ORIGIN = /^https:\/\/(www|web|business)\.facebook\.com$/;
type SignupSession = { phoneId?: string; wabaId?: string };

/**
 * Meta's Embedded Signup: loads the Facebook SDK once and keeps the number and account IDs that the
 * signup window posts back. The one-time code travels to our server; the token never reaches the browser.
 */
function useEmbeddedSignup(config: WhatsAppSignupConfig | null, onEvent: (event: string) => void) {
  const sessionRef = useRef<SignupSession>({});
  const handler = useRef(onEvent);
  useEffect(() => { handler.current = onEvent; }, [onEvent]);
  const appId = config?.appId, version = config?.version;
  useEffect(() => {
    if (!appId || !version) return;
    const onMessage = (event: MessageEvent) => {
      if (!META_ORIGIN.test(event.origin) || typeof event.data !== "string") return;
      let data: { type?: string; event?: string; data?: { phone_number_id?: unknown; waba_id?: unknown } };
      try { data = JSON.parse(event.data); } catch { return; } // Facebook also posts messages that are not JSON.
      if (data?.type !== "WA_EMBEDDED_SIGNUP") return;
      if (data.event === "FINISH" || data.event === "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING")
        sessionRef.current = { phoneId: String(data.data?.phone_number_id ?? ""), wabaId: String(data.data?.waba_id ?? "") };
      handler.current(data.event ?? "");
    };
    window.addEventListener("message", onMessage);
    const init = () => window.FB?.init({ appId, autoLogAppEvents: true, xfbml: false, version });
    if (window.FB) init();
    else {
      window.fbAsyncInit = init;
      if (!document.getElementById(SDK_ID)) {
        const script = document.createElement("script");
        script.id = SDK_ID; script.src = "https://connect.facebook.net/es_LA/sdk.js";
        script.async = true; script.defer = true; script.crossOrigin = "anonymous";
        script.onerror = () => handler.current("SDK_BLOCKED");
        document.body.appendChild(script);
      }
    }
    return () => window.removeEventListener("message", onMessage);
  }, [appId, version]);
  return sessionRef;
}

const fieldClass="mt-1.5 font-normal";
const labelClass="block text-xs font-medium text-ink-soft";
export function WhatsAppSetupView({initial}:{initial:WhatsAppSetup}) {
  const [setup,setSetup]=useState(initial);
  const [phoneId,setPhoneId]=useState(initial.account?.phone_number_id??"");
  const [wabaId,setWabaId]=useState(initial.account?.waba_id??"");
  const [token,setToken]=useState("");
  const [pin,setPin]=useState("");
  const [busy,setBusy]=useState(false);
  const [signupBusy,setSignupBusy]=useState(false);
  const [manualOpen,setManualOpen]=useState(false);
  const [notice,setNotice]=useState<{error?:string;message?:string}|null>(null);
  const ready=setup.requirements.every(item=>item.ready);
  async function refresh() {
    const response=await fetch("/api/whatsapp/setup",{cache:"no-store"});
    const data=await response.json();
    if (!response.ok) throw new Error("No pude actualizar el estado.");
    setSetup(data);
  }
  async function run(operation:Record<string,string>) {
    setBusy(true);setNotice(null);
    try {
      const response=await fetch("/api/whatsapp/setup",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(operation)});
      const data=await response.json();
      if (!response.ok) {setNotice({error:data.error||"No se pudo completar la operación."});return;}
      setNotice({message:data.message});
      if (data.pinPending) setManualOpen(true);
      await refresh();
    } catch {setNotice({error:"No pude completar o confirmar la operación. Actualiza el estado antes de reintentar."});}
    finally {setToken("");setPin("");setBusy(false);}
  }
  function save(event:FormEvent<HTMLFormElement>) {event.preventDefault();void run({operation:"save",phoneId,wabaId,accessToken:token});}
  const onSignupEvent=useCallback((event:string)=>{
    if (event==="FINISH_ONLY_WABA") setNotice({error:"Creaste la cuenta de WhatsApp Business pero no agregaste un número. Vuelve a pulsar Conectar y agrega tu número."});
    else if (event==="CANCEL") setNotice({error:"Cerraste la ventana de Meta antes de terminar. Puedes volver a intentarlo cuando quieras."});
    else if (event==="ERROR") setNotice({error:"Meta reportó un error durante la conexión. Espera un momento e inténtalo de nuevo."});
    else if (event==="SDK_BLOCKED") setNotice({error:"El navegador bloqueó el script de Meta, normalmente por un bloqueador de anuncios. Permítelo en esta página y recarga."});
  },[]);
  const sessionRef=useEmbeddedSignup(setup.canManage ? setup.signup : null,onSignupEvent);
  function connect() {
    const config=setup.signup, fb=window.FB;
    if (!config) return;
    // Meta refuses FB.login on plain http (local development included); say so instead of waiting forever.
    if (window.location.protocol!=="https:") {setNotice({error:"La ventana de Meta solo se abre desde una página segura (https). Entra por zoraxpilot.com."});return;}
    if (!fb) {setNotice({error:"La ventana de Meta todavía se está cargando. Espera un segundo y vuelve a pulsar."});return;}
    sessionRef.current={};setNotice(null);setSignupBusy(true);
    fb.login(response=>{void (async()=>{
      const code=response.authResponse?.code;
      // The IDs usually arrive by message a moment before the code; give them a short while.
      for (let attempt=0;attempt<30&&code&&!(sessionRef.current.phoneId&&sessionRef.current.wabaId);attempt++) await new Promise(resolve=>setTimeout(resolve,100));
      const {phoneId:signupPhone,wabaId:signupWaba}=sessionRef.current;
      setSignupBusy(false);
      if (!code||!signupPhone||!signupWaba) {setNotice(current=>current??{error:"No se completó la conexión con Meta. Vuelve a pulsar Conectar WhatsApp y termina todos los pasos de la ventana."});return;}
      await run({operation:"signup",code,phoneId:signupPhone,wabaId:signupWaba});
    })();},{config_id:config.configId,response_type:"code",override_default_response_type:true,extras:{setup:{},featureType:"",sessionInfoVersion:"3"}});
  }
  const account=setup.account;
  const oneClick=setup.canManage&&Boolean(setup.signup);
  const manual=<div className="grid items-start gap-5 lg:grid-cols-[1fr_1.1fr]">
    <Panel>
      <PanelHeader title="Prepara tu número"/>
      <ol className="divide-y divide-line text-[13px] leading-6 text-ink-soft">
        <li className="flex gap-3 px-4 py-3 sm:px-5"><span className="w-3 shrink-0 font-medium tabular-nums text-muted">1</span><div className="min-w-0"><strong className="block font-semibold text-ink">Crea tu aplicación en Meta</strong>Activa WhatsApp y vincula tu portafolio empresarial. Conserva la SIM disponible para recibir el código.
          <a href="https://developers.facebook.com/apps/" target="_blank" rel="noreferrer" className="mt-1.5 flex w-fit items-center gap-1.5 font-medium text-ink underline underline-offset-4 transition hover:text-ink-soft">Abrir Meta for Developers<ExternalLink className="size-3"/></a></div></li>
        <li className="flex gap-3 px-4 py-3 sm:px-5"><span className="w-3 shrink-0 font-medium tabular-nums text-muted">2</span><div className="min-w-0"><strong className="block font-semibold text-ink">Agrega y verifica tu SIM</strong>En la configuración de WhatsApp agrega tu número real y verifícalo por SMS o llamada. Copia el Phone Number ID y el WhatsApp Business Account ID. Son identificadores de Meta, no tu celular.</div></li>
        <li className="flex gap-3 px-4 py-3 sm:px-5"><span className="w-3 shrink-0 font-medium tabular-nums text-muted">3</span><div className="min-w-0"><strong className="block font-semibold text-ink">Configura el webhook</strong>Usa esta dirección y suscribe el campo <code className="rounded bg-subtle px-1 font-mono text-xs text-ink">messages</code>:
          <code className="mt-2 block break-all rounded-md border border-line bg-subtle px-3 py-2 font-mono text-xs text-ink-soft">{setup.webhookUrl}</code>
          <p className="mt-2">El Verify Token debe coincidir con el guardado en el servidor. No lo pegues en un chat.</p></div></li>
        <li className="flex gap-3 px-4 py-3 sm:px-5"><span className="w-3 shrink-0 font-medium tabular-nums text-muted">4</span><div className="min-w-0"><strong className="block font-semibold text-ink">Guarda las credenciales y activa el canal</strong>Usa un token de usuario del sistema con acceso a tu cuenta y permisos de gestión y mensajería. El token temporal de Meta sirve para pruebas y caduca; sustitúyelo antes de usar el canal a diario.</div></li>
      </ol>
      <p className="border-t border-line bg-subtle/50 px-4 py-3 text-xs leading-5 text-muted sm:px-5">Al tomar un handoff, la conversación y su historial siguen en el CRM y Zorax cede la atención.</p>
    </Panel>
    <div className="space-y-5">
      {setup.canManage ? <>
        <Panel>
          <PanelHeader title="Credenciales de Meta"/>
          <div className="space-y-4 px-4 py-4 sm:px-5">
            {!ready&&<div role="status" className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-[13px] text-amber-800"><p>Falta completar la aplicación en el servidor. El formulario se habilitará cuando esté preparada.</p><ul className="mt-2 space-y-1">{setup.requirements.map(item=><li key={item.name} className="flex items-center gap-2">{item.ready?<Check className="size-3"/>:<span className="size-1.5 rounded-full bg-amber-500"/>}<code className="font-mono text-xs">{item.name}</code>: {item.ready?"listo":"pendiente"}</li>)}</ul></div>}
            <form onSubmit={save} className="space-y-4">
              <label className={labelClass}>Phone Number ID<Input required inputMode="numeric" pattern="[0-9]{5,30}" maxLength={30} value={phoneId} onChange={event=>setPhoneId(event.target.value)} className={fieldClass} placeholder="ID del número en Meta"/></label>
              <label className={labelClass}>WhatsApp Business Account ID<Input required inputMode="numeric" pattern="[0-9]{5,30}" maxLength={30} value={wabaId} onChange={event=>setWabaId(event.target.value)} className={fieldClass} placeholder="WABA ID"/></label>
              <label className={labelClass}>Token de acceso<Input required type="password" autoComplete="new-password" spellCheck={false} minLength={20} maxLength={8192} value={token} onChange={event=>setToken(event.target.value)} className={fieldClass} placeholder="Pégalo aquí, no en el chat"/></label>
              <p className="text-xs leading-5 text-muted">Se valida con Meta y se cifra en el servidor. No se vuelve a mostrar ni se guarda en este navegador.</p>
              <Button type="submit" disabled={busy||!ready}>{busy?"Comprobando…":"Verificar y guardar"}</Button>
            </form>
          </div>
        </Panel>
        <Panel>
          <PanelHeader title="Activa la recepción"/>
          <div className="space-y-3 px-4 py-4 sm:px-5">
            <p className="text-[13px] leading-6 text-ink-soft">Tras verificar la SIM y guardar las credenciales, registra el número con un PIN de 6 dígitos para la verificación en dos pasos. Es diferente del código SMS; consérvalo.</p>
            <form onSubmit={event=>{event.preventDefault();void run({operation:"register",pin});}} className="space-y-3"><label className={labelClass}>PIN de verificación en dos pasos<Input required type="password" autoComplete="new-password" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={pin} onChange={event=>setPin(event.target.value)} className={fieldClass} placeholder="6 dígitos"/></label><Button type="submit" disabled={busy||!ready||!account}>Registrar y suscribir aplicación</Button></form>
            <Button variant="ghost" size="sm" disabled={busy||!ready||!account} onClick={()=>void run({operation:"subscribe"})} className="-ml-2 h-auto whitespace-normal py-1.5 text-left text-xs">Ya registré el número en Meta: solo suscribir aplicación</Button>
            <p className="border-t border-line pt-3 text-xs leading-5 text-muted">Estas operaciones no envían mensajes a tus clientes. La prueba final se inicia escribiendo tú desde otro WhatsApp.</p>
          </div>
        </Panel>
      </> : <Panel><PanelHeader title="Conexión del negocio"/><p className="px-4 py-3 text-[13px] leading-6 text-ink-soft sm:px-5">El dueño del negocio puede vincular y gestionar el número. Tú puedes atender las conversaciones según tu rol.</p></Panel>}
    </div>
  </div>;
  return <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
    <PageHeader title="WhatsApp" description="Conecta el número de tu negocio y atiende las conversaciones desde el CRM."
      actions={<Button variant="secondary" size="sm" disabled={busy} onClick={()=>{setBusy(true);void refresh().catch(()=>setNotice({error:"No pude actualizar el estado."})).finally(()=>setBusy(false));}}><RefreshCw className="size-4"/>Actualizar</Button>}/>
    <div className="space-y-5">
      <Panel className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <h2 className="text-[13px] font-semibold tabular-nums text-ink">{account?.display_phone||"Sin número conectado"}</h2>
          <p className="mt-0.5 text-xs text-muted">{account?.last_webhook_at ? `Último mensaje recibido: ${new Date(account.last_webhook_at).toLocaleString("es-CO")}` : "Envía un mensaje desde otro teléfono al terminar para probar la recepción."}</p>
        </div>
        <Badge variant={account?.last_webhook_at ? "success" : account?.connection_status==="verified" ? "info" : "warning"}>{account?.last_webhook_at ? "Recepción comprobada" : account?.connection_status==="verified" ? "Credenciales verificadas" : "Pendiente de vincular"}</Badge>
      </Panel>
      {notice&&<p role={notice.error?"alert":"status"} className={`rounded-md border px-4 py-3 text-[13px] ${notice.error?"border-rose-200 bg-rose-50 text-rose-800":"border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{notice.error||notice.message}</p>}
      {oneClick ? <>
        <Panel>
          <PanelHeader title="Conecta tu WhatsApp en un clic"/>
          <div className="grid gap-5 px-4 py-4 sm:px-5 lg:grid-cols-[1.2fr_1fr] lg:items-center">
            <div className="space-y-3">
              <p className="text-[13px] leading-6 text-ink-soft">Se abre una ventana de Meta. Entras con Facebook, eliges o creas la cuenta de WhatsApp Business de tu negocio y verificas tu número por SMS o llamada. Zorax guarda el acceso cifrado y deja el número listo para recibir mensajes.</p>
              <ul className="space-y-1 text-xs leading-5 text-muted">
                <li className="flex gap-2"><Check className="mt-1 size-3 shrink-0"/>No necesitas ser empresa registrada para empezar.</li>
                <li className="flex gap-2"><Check className="mt-1 size-3 shrink-0"/>Sirve una SIM nueva. Si tu número ya está en la app de WhatsApp Business, Meta puede ofrecerte conservarla y conectar ese mismo número.</li>
                <li className="flex gap-2"><Check className="mt-1 size-3 shrink-0"/>Sin IDs ni tokens: Zorax hace el registro por ti y te muestra el PIN de seguridad una sola vez.</li>
              </ul>
            </div>
            <div className="flex flex-col items-start gap-2 lg:items-end">
              <Button size="lg" disabled={busy||signupBusy} onClick={connect}><MessageCircle className="size-4"/>{signupBusy?"Esperando a Meta…":account?"Conectar otro número":"Conectar WhatsApp con Meta"}</Button>
              <p className="text-xs text-muted">Permite las ventanas emergentes de Meta si tu navegador las bloquea.</p>
            </div>
          </div>
        </Panel>
        <details open={manualOpen} onToggle={event=>setManualOpen(event.currentTarget.open)} className="rounded-lg border border-line bg-surface">
          <summary className="cursor-pointer px-4 py-3 text-[13px] font-medium text-ink sm:px-5">Conexión manual con IDs y token, o registro con tu propio PIN (avanzado)</summary>
          <div className="border-t border-line p-4 sm:p-5">{manual}</div>
        </details>
      </> : manual}
      <Link href="/dashboard/conversations" className="flex items-center justify-between rounded-lg border border-line bg-surface px-4 py-3 text-[13px] font-medium text-ink transition hover:bg-subtle sm:px-5">Ir a conversaciones<ArrowRight className="size-4 text-muted"/></Link>
    </div>
  </div>;
}
