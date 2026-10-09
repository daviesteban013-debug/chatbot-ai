"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Check, ExternalLink, MessageCircle, ShieldCheck, RefreshCw, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { WhatsAppSetup } from "@/lib/whatsapp/setup";

const fieldClass="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-950 outline-none focus:border-yellow-500 focus:ring-2 focus:ring-yellow-400/20";
export function WhatsAppSetupView({initial}:{initial:WhatsAppSetup}) {
  const [setup,setSetup]=useState(initial);
  const [phoneId,setPhoneId]=useState(initial.account?.phone_number_id??"");
  const [wabaId,setWabaId]=useState(initial.account?.waba_id??"");
  const [token,setToken]=useState("");
  const [pin,setPin]=useState("");
  const [busy,setBusy]=useState(false);
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
      await refresh();
    } catch {setNotice({error:"No pude completar o confirmar la operación. Actualiza el estado antes de reintentar."});}
    finally {setToken("");setPin("");setBusy(false);}
  }
  function save(event:FormEvent<HTMLFormElement>) {event.preventDefault();void run({operation:"save",phoneId,wabaId,accessToken:token});}
  const account=setup.account;
  return <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 lg:py-8">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div><p className="text-xs font-semibold uppercase tracking-[.2em] text-slate-500">Canales de tu negocio</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Tu WhatsApp. Con NEXO.</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Conecta tu SIM nueva por WhatsApp Cloud API y atiende las conversaciones desde el CRM.</p></div>
      <Button variant="secondary" disabled={busy} onClick={()=>{setBusy(true);void refresh().catch(()=>setNotice({error:"No pude actualizar el estado."})).finally(()=>setBusy(false));}}><RefreshCw className="size-4"/>Actualizar</Button>
    </div>
    <section className="flex flex-wrap items-center gap-4 rounded-2xl bg-slate-950 p-6 text-white">
      <span className="flex size-12 items-center justify-center rounded-xl bg-yellow-400 text-slate-950"><MessageCircle className="size-6"/></span>
      <div className="flex-1"><h2 className="font-semibold">{account?.display_phone||"Tu número está por llegar"}</h2><p className="mt-1 text-sm text-slate-400">{account?.last_webhook_at ? `Último mensaje recibido: ${new Date(account.last_webhook_at).toLocaleString("es-CO")}` : "Envía un mensaje desde otro teléfono al terminar para probar la recepción."}</p></div>
      <span className="rounded-full border border-white/15 px-3 py-1.5 text-xs">{account?.last_webhook_at ? "Recepción comprobada" : account?.connection_status==="verified" ? "Credenciales verificadas" : "Pendiente de vincular"}</span>
    </section>
    {notice&&<p role={notice.error?"alert":"status"} className={`rounded-xl border p-4 text-sm ${notice.error?"border-rose-200 bg-rose-50 text-rose-800":"border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{notice.error||notice.message}</p>}
    <div className="grid items-start gap-6 lg:grid-cols-[1fr_1.1fr]">
      <section className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-slate-950">Prepara tu número</h2>
        <ol className="space-y-5 text-sm leading-6 text-slate-600">
          <li><strong className="block text-slate-950">1. Crea tu aplicación en Meta</strong>Activa WhatsApp y vincula tu portafolio empresarial. Conserva la SIM disponible para recibir el código.
            <a href="https://developers.facebook.com/apps/" target="_blank" rel="noreferrer" className="mt-2 flex w-fit items-center gap-2 font-medium text-slate-950 underline underline-offset-4">Abrir Meta for Developers<ExternalLink className="size-3"/></a></li>
          <li><strong className="block text-slate-950">2. Agrega y verifica tu SIM</strong>En la configuración de WhatsApp agrega tu número real y verifícalo por SMS o llamada. Copia el Phone Number ID y el WhatsApp Business Account ID. Son identificadores de Meta, no tu celular.</li>
          <li><strong className="block text-slate-950">3. Configura el webhook</strong>Usa esta dirección y suscribe el campo <code>messages</code>:
            <code className="mt-2 block break-all rounded-lg bg-slate-50 p-3 text-xs text-slate-800">{setup.webhookUrl}</code>
            <p className="mt-2">El Verify Token debe coincidir con el guardado en el servidor. No lo pegues en un chat.</p></li>
          <li><strong className="block text-slate-950">4. Guarda las credenciales y activa el canal</strong>Usa un token de usuario del sistema con acceso a tu cuenta y permisos de gestión y mensajería. El token temporal de Meta sirve para pruebas y caduca; sustitúyelo antes de usar el canal a diario.</li>
        </ol>
        <div className="rounded-xl bg-yellow-50 p-4 text-sm leading-6 text-slate-700"><strong className="text-slate-950">La persona sigue al mando.</strong> Al tomar un handoff, la conversación y su historial siguen en el CRM y NEXO cede la atención.</div>
      </section>
      <div className="space-y-6">
        {setup.canManage ? <>
          <section className="rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="flex items-center gap-2 text-lg font-semibold"><ShieldCheck className="size-5"/>Conexión protegida</h2>
            {!ready&&<div role="status" className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-900"><p>Falta completar la aplicación en el servidor. El formulario se habilitará cuando esté preparada.</p><ul className="mt-2 space-y-1">{setup.requirements.map(item=><li key={item.name} className="flex items-center gap-2">{item.ready?<Check className="size-3"/>:<span className="size-1.5 rounded-full bg-amber-500"/>}<code className="text-xs">{item.name}</code>: {item.ready?"listo":"pendiente"}</li>)}</ul></div>}
            <form onSubmit={save} className="mt-5 space-y-4">
              <label className="block text-sm font-medium">Phone Number ID<input required inputMode="numeric" pattern="[0-9]{5,30}" maxLength={30} value={phoneId} onChange={event=>setPhoneId(event.target.value)} className={fieldClass} placeholder="ID del número en Meta"/></label>
              <label className="block text-sm font-medium">WhatsApp Business Account ID<input required inputMode="numeric" pattern="[0-9]{5,30}" maxLength={30} value={wabaId} onChange={event=>setWabaId(event.target.value)} className={fieldClass} placeholder="WABA ID"/></label>
              <label className="block text-sm font-medium">Token de acceso<input required type="password" autoComplete="new-password" spellCheck={false} minLength={20} maxLength={8192} value={token} onChange={event=>setToken(event.target.value)} className={fieldClass} placeholder="Pégalo aquí, no en el chat"/></label>
              <p className="text-xs leading-5 text-slate-500">Se valida con Meta y se cifra en el servidor. No se vuelve a mostrar ni se guarda en este navegador.</p>
              <Button type="submit" disabled={busy||!ready} className="w-full bg-yellow-400 text-slate-950 hover:bg-yellow-300">{busy?"Comprobando…":"Verificar y guardar"}<ArrowRight className="size-4"/></Button>
            </form>
          </section>
          <section className="rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="text-lg font-semibold">Activa la recepción</h2><p className="mt-2 text-sm leading-6 text-slate-500">Tras verificar la SIM y guardar las credenciales, registra el número con un PIN de 6 dígitos para la verificación en dos pasos. Es diferente del código SMS; consérvalo.</p>
            <form onSubmit={event=>{event.preventDefault();void run({operation:"register",pin});}} className="mt-4 space-y-3"><label className="block text-sm font-medium">PIN de verificación en dos pasos<input required type="password" autoComplete="new-password" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={pin} onChange={event=>setPin(event.target.value)} className={fieldClass} placeholder="6 dígitos"/></label><Button type="submit" disabled={busy||!ready||!account} className="w-full">Registrar y suscribir aplicación</Button></form>
            <Button variant="ghost" disabled={busy||!ready||!account} onClick={()=>void run({operation:"subscribe"})} className="mt-2 h-auto w-full whitespace-normal py-2 text-xs">Ya registré el número en Meta: solo suscribir aplicación</Button>
            <p className="mt-3 text-xs leading-5 text-slate-500">Estas operaciones no envían mensajes a tus clientes. La prueba final se inicia escribiendo tú desde otro WhatsApp.</p>
          </section>
        </> : <section className="rounded-2xl border border-slate-200 bg-white p-6"><h2 className="font-semibold">Conexión del negocio</h2><p className="mt-2 text-sm text-slate-500">El dueño del negocio puede vincular y gestionar el número. Tú puedes atender las conversaciones según tu rol.</p></section>}
        <Link href="/dashboard/conversations" className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-5 text-sm font-medium">Ir a conversaciones<ArrowRight className="size-4"/></Link>
      </div>
    </div>
  </div>;
}
