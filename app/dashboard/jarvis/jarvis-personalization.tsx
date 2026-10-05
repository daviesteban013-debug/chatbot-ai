"use client";

import { useState, useTransition } from "react";
import { Volume2, Save, X } from "lucide-react";
import { MAX_MEMORIES, voiceLocales, type JarvisPersonalization } from "@/lib/jarvis-personalization";
import { useJarvisVoice } from "@/hooks/useJarvisVoice";
import { saveJarvisPersonalization } from "./actions";

const field = "w-full rounded-xl border border-white/15 bg-zinc-950 px-3 py-2.5 text-sm text-white outline-none focus:border-yellow-300";

export function JarvisPersonalizationPanel({ profile, tone, authenticated, onSaved, onClose }: {
  profile: JarvisPersonalization;
  tone: string;
  authenticated: boolean;
  onSaved: (profile: JarvisPersonalization) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(profile);
  const [status, setStatus] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pending, startSave] = useTransition();
  const { voices, supported, error, speak, stop } = useJarvisVoice(draft, tone);
  const set = <K extends keyof JarvisPersonalization>(key: K, value: JarvisPersonalization[K]) => { setDraft(p => ({ ...p, [key]: value })); setStatus(null); };
  const voice = <K extends keyof JarvisPersonalization["voice"]>(key: K, value: JarvisPersonalization["voice"][K]) => set("voice", { ...draft.voice, [key]: value });

  function save() {
    setStatus(null); setSaveError(null); stop();
    startSave(async () => {
      try {
        const result = await saveJarvisPersonalization(draft);
        if (!result.ok) { setSaveError(result.error); return; }
        setDraft(result.profile); onSaved(result.profile);
        setStatus("Guardado. Jarvis usará tus preferencias desde la próxima respuesta.");
      } catch { setSaveError("No se pudo guardar. Revisa tu conexión e inténtalo de nuevo."); }
    });
  }

  return (
    <section aria-label="Personalización de Jarvis" className="relative z-30 mx-4 my-4 rounded-3xl border border-yellow-300/25 bg-zinc-900 p-5 sm:mx-6 sm:p-6">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div><h2 className="text-lg font-semibold">Tu Jarvis, a tu manera</h2><p className="mt-1 text-sm text-zinc-400">Voz, trato y recuerdos personales. Se guardan solo en tu cuenta.</p></div>
        <button type="button" onClick={onClose} aria-label="Cerrar personalización" className="rounded-lg p-2 hover:bg-white/10"><X className="size-5" /></button>
      </div>
      {!authenticated && <p className="mb-4 text-sm text-yellow-200">Puedes probar la voz. Inicia sesión para guardar preferencias y recuerdos.</p>}
      <fieldset disabled={pending} className="grid gap-6 md:grid-cols-2 disabled:opacity-60">
        <div className="space-y-4">
          <Field label="Cómo quieres que te llame"><input className={field} value={draft.displayName} onChange={e => set("displayName", e.target.value)} maxLength={40} placeholder="Tu nombre o apodo" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Trato"><select className={field} value={draft.address} onChange={e => set("address", e.target.value as JarvisPersonalization["address"])}><option value="tu">De tú</option><option value="usted">De usted</option></select></Field>
            <Field label="Respuestas"><select className={field} value={draft.responseLength} onChange={e => set("responseLength", e.target.value as JarvisPersonalization["responseLength"])}><option value="breve">Breves</option><option value="equilibrada">Equilibradas</option><option value="detallada">Detalladas</option></select></Field>
          </div>
          <Field label={`Lo que Jarvis recuerda de ti (${draft.memories.length}/${MAX_MEMORIES})`}><textarea className={`${field} min-h-32`} value={draft.memories.join("\n")} onChange={e => set("memories", e.target.value.split("\n").slice(0, MAX_MEMORIES))} placeholder={"Prefiero ejemplos prácticos\nMi negocio vende tecnología"} maxLength={MAX_MEMORIES * 241} /><span className="mt-1 block text-xs text-zinc-400">Una preferencia por línea, hasta 240 caracteres. También puedes decir «recuerda que prefiero respuestas cortas» en el chat. Borra una línea para olvidarla.</span></Field>
          <button type="button" onClick={() => set("memories", [])} className="text-xs text-zinc-300 underline">Borrar todos los recuerdos</button>
        </div>
        <div className="space-y-4">
          <Field label="Variante del español"><select className={field} value={draft.voice.locale} onChange={e => voice("locale", e.target.value)}>{voiceLocales.map((locale, i) => <option key={locale} value={locale}>{["Colombia", "México", "España", "Argentina", "Estados Unidos"][i]}</option>)}</select></Field>
          <Field label="Voz hablada"><select className={field} value={draft.voice.uri} onChange={e => voice("uri", e.target.value)} disabled={!supported}><option value="">Automática según tu idioma</option>{voices.map(v => <option key={`${v.voiceURI}-${v.lang}`} value={v.voiceURI}>{v.name} · {v.lang}</option>)}{draft.voice.uri && !voices.some(v => v.voiceURI === draft.voice.uri) && <option value={draft.voice.uri}>Voz guardada no disponible en este dispositivo</option>}</select><span className="mt-1 block text-xs text-zinc-400">Las voces disponibles dependen de tu navegador y dispositivo. Si falta la elegida, Jarvis usa otra voz en español.</span></Field>
          <Field label={`Velocidad: ${draft.voice.rate.toFixed(2)}×`}><input type="range" className="w-full accent-yellow-300" min={0.7} max={1.4} step={0.05} value={draft.voice.rate} onChange={e => voice("rate", Number(e.target.value))} /></Field>
          <Field label={`Entonación: ${draft.voice.pitch.toFixed(2)}`}><input type="range" className="w-full accent-yellow-300" min={0.6} max={1.4} step={0.05} value={draft.voice.pitch} onChange={e => voice("pitch", Number(e.target.value))} /></Field>
          <label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={draft.voice.adaptive} onChange={e => voice("adaptive", e.target.checked)} className="mt-1 accent-yellow-300" /><span>Voz adaptativa<span className="mt-1 block text-xs text-zinc-400">Ajusta el ritmo y la entonación según la personalidad; habla más despacio al explicar pasos o cifras.</span></span></label>
          <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={draft.voice.enabled} onChange={e => voice("enabled", e.target.checked)} className="accent-yellow-300" />Leer las nuevas respuestas en voz alta</label>
          <button type="button" disabled={!supported} onClick={() => speak(`Hola${draft.displayName ? `, ${draft.displayName}` : ""}. Soy Jarvis. Esta es mi voz. Vamos paso a paso para ayudarte con tu negocio.`, true)} className="flex items-center gap-2 rounded-xl border border-white/20 px-4 py-2 text-sm disabled:opacity-40"><Volume2 className="size-4" />Escuchar prueba</button>
          {!supported && <p className="text-xs text-zinc-400">Este navegador no ofrece lectura de voz. El chat sigue disponible.</p>}
          {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
        </div>
      </fieldset>
      <div className="mt-6 flex flex-wrap items-center gap-3"><button type="button" onClick={save} disabled={pending || !authenticated} className="flex items-center gap-2 rounded-xl bg-yellow-300 px-5 py-3 text-sm font-semibold text-black disabled:opacity-40"><Save className="size-4" />{pending ? "Guardando…" : "Guardar personalización"}</button><span className="text-xs text-zinc-400">Cerrar sin guardar descarta los cambios.</span></div>
      {status && <p role="status" className="mt-3 text-sm text-emerald-300">{status}</p>}
      {saveError && <p role="alert" className="mt-3 text-sm text-red-300">{saveError}</p>}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-2 block text-xs font-medium text-zinc-300">{label}</span>{children}</label>;
}
