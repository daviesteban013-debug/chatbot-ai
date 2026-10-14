"use client";

import { useState, useTransition } from "react";
import { Check, Save } from "lucide-react";
import { NexoMark } from "@/components/brand/nexo-mark";
import type { JarvisConfig as Config } from "@/lib/jarvis";
import { saveJarvisConfig } from "./actions";

const tones = [
  { id: "cercano", label: "Cercano", sample: "¡Hola! Claro que sí, con gusto te ayudo con eso." },
  { id: "profesional", label: "Profesional", sample: "Buen día. Con gusto le colaboro con su solicitud." },
  { id: "divertido", label: "Divertido", sample: "¡Ey! Llegaste al lugar correcto, vamos a resolverlo." },
  { id: "directo", label: "Directo", sample: "Hola. Dime qué necesitas y te lo resuelvo." },
];

const accents = ["#facc15", "#34d399", "#38bdf8", "#f472b6", "#a78bfa"];

const abilities = [
  { id: "catalogo", label: "Responder catálogo y precios" },
  { id: "pedidos", label: "Tomar y registrar pedidos" },
  { id: "agenda", label: "Agendar citas y cotizaciones" },
  { id: "handoff", label: "Transferir a un humano cuando lo pida" },
  { id: "seguimiento", label: "Seguimiento a clientes que no respondieron" },
];


const field = "w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-zinc-500 focus:ring-2 focus:ring-white/10";

export function JarvisStudio({ initial, onSaved }: { initial: Config; onSaved?: (config: Config) => void }) {
  const [cfg, setCfg] = useState<Config>(initial);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pending, startSave] = useTransition();

  const set = <K extends keyof Config>(k: K, v: Config[K]) => {
    setSaved(false);
    setCfg((c) => ({ ...c, [k]: v }));
  };
  const toggle = (id: string) =>
    set("abilities", cfg.abilities.includes(id) ? cfg.abilities.filter((a) => a !== id) : [...cfg.abilities, id]);

  function save() {
    setSaveError(null);
    startSave(async () => {
      const res = await saveJarvisConfig(cfg);
      if (res.ok) { setCfg(res.config); setSaved(true); onSaved?.(res.config); }
      else setSaveError(res.error);
    });
  }

  const tone = tones.find((t) => t.id === cfg.tone) ?? tones[0];
  const welcome = cfg.welcome.replaceAll("{agente}", cfg.name || "NEXO").replaceAll("{negocio}", cfg.business || "tu negocio");

  return (
    <div className="min-h-svh bg-[#0c0c0e] px-4 py-8 text-zinc-100 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="border-b border-white/10 pb-5">
          <p className="text-xs text-zinc-500">NEXO · Configuración</p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-white">Personalizar NEXO</h1>
          <p className="mt-1 text-sm text-zinc-400">Nombre, tono, capacidades y reglas. La vista previa muestra cómo respondería en WhatsApp.</p>
        </header>

        <div className="mt-6 grid gap-5 lg:grid-cols-[1.25fr_.75fr]">
          <div className="space-y-5">
            <Card title="Identidad">
              <div className="grid gap-4 sm:grid-cols-2">
                <Label text="Nombre del agente"><input className={field} value={cfg.name} onChange={(e) => set("name", e.target.value)} maxLength={24} /></Label>
                <Label text="Nombre de tu negocio"><input className={field} value={cfg.business} onChange={(e) => set("business", e.target.value)} placeholder="Ej. Tenis Urban" maxLength={48} /></Label>
              </div>
              <div className="mt-5">
                <p className="mb-2 text-xs font-medium text-zinc-400">Color</p>
                <div className="flex gap-3">
                  {accents.map((c) => (
                    <button key={c} type="button" aria-label={`Color ${c}`} aria-pressed={cfg.accent === c} onClick={() => set("accent", c)} style={{ background: c }} className={`size-7 rounded-full ring-offset-2 ring-offset-zinc-950 transition ${cfg.accent === c ? "ring-2 ring-white" : "opacity-70 hover:opacity-100"}`} />
                  ))}
                </div>
              </div>
            </Card>

            <Card title="Tono de voz">
              <div className="grid gap-3 sm:grid-cols-2">
                {tones.map((t) => (
                  <button key={t.id} type="button" aria-pressed={cfg.tone === t.id} onClick={() => set("tone", t.id)} className={`rounded-md border p-3 text-left transition ${cfg.tone === t.id ? "border-zinc-400 bg-white/[.06]" : "border-zinc-800 bg-zinc-950 hover:border-zinc-600"}`}>
                    <p className="text-sm font-medium text-white">{t.label}</p>
                    <p className="mt-1 text-xs text-zinc-500">{t.sample}</p>
                  </button>
                ))}
              </div>
              <Label text="Mensaje de bienvenida" className="mt-5">
                <textarea className={`${field} min-h-24 resize-y`} value={cfg.welcome} onChange={(e) => set("welcome", e.target.value)} maxLength={300} />
                <span className="mt-1 block text-[11px] text-zinc-600">Usa {"{agente}"} y {"{negocio}"} como variables.</span>
              </Label>
            </Card>

            <Card title="Capacidades">
              <div className="divide-y divide-zinc-800 overflow-hidden rounded-md border border-zinc-800">
                {abilities.map((a) => {
                  const on = cfg.abilities.includes(a.id);
                  return (
                    <button key={a.id} type="button" role="switch" aria-checked={on} onClick={() => toggle(a.id)} className="flex w-full items-center justify-between bg-zinc-950 px-3 py-2.5 text-left text-sm text-zinc-200 transition hover:bg-white/[.03]">
                      {a.label}
                      <span className={`flex h-5 w-9 items-center rounded-full p-0.5 transition ${on ? "bg-yellow-300" : "bg-zinc-700"}`}><span className={`size-4 rounded-full bg-zinc-950 transition ${on ? "translate-x-4" : ""}`} /></span>
                    </button>
                  );
                })}
              </div>
              <Label text={`Descuento máximo que puede ofrecer: ${cfg.maxDiscount}%`} className="mt-5">
                <input type="range" min={0} max={30} value={cfg.maxDiscount} onChange={(e) => set("maxDiscount", Number(e.target.value))} className="w-full accent-yellow-300" />
              </Label>
            </Card>

            <Card title="Reglas del negocio">
              <textarea className={`${field} min-h-32 resize-y`} value={cfg.rules} onChange={(e) => set("rules", e.target.value)} placeholder={"Horario: lunes a sábado 8 a. m.–6 p. m.\nEnvíos a todo Colombia en 2 a 4 días hábiles\nCambios de talla dentro de los 15 días"} maxLength={1500} />
            </Card>

            <button type="button" onClick={save} disabled={pending} className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-yellow-300 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-yellow-200 disabled:opacity-60 sm:w-auto">
              {pending ? "Guardando…" : saved ? <><Check className="size-4" />Guardado</> : <><Save className="size-4" />Guardar configuración</>}
            </button>
            {saveError && <p role="alert" className="text-xs text-red-300">{saveError}</p>}
          </div>

          {/* Vista previa */}
          <aside className="lg:sticky lg:top-8 lg:self-start">
            <div className="overflow-hidden rounded-lg border border-white/10 bg-zinc-900/60">
              <div className="flex items-center gap-3 border-b border-white/10 bg-zinc-900 px-4 py-3">
                <NexoMark className="size-8" />
                <div><p className="text-sm font-medium text-white">{cfg.name || "NEXO"}</p><p className="text-[11px] text-zinc-500">Vista previa de WhatsApp</p></div>
              </div>
              <div className="space-y-3 p-4 text-sm">
                <Bubble>{welcome}</Bubble>
                <Bubble me>¿Tienen domicilio?</Bubble>
                <Bubble>{tone.sample}</Bubble>
              </div>
              <p className="border-t border-white/10 px-4 py-2.5 text-[11px] text-zinc-500">Vista previa ilustrativa · {cfg.abilities.length} capacidades activas</p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-white/10 bg-zinc-900/50 p-5">
      <h2 className="mb-4 text-[13px] font-semibold text-white">{title}</h2>
      {children}
    </section>
  );
}

function Label({ text, children, className = "" }: { text: string; children: React.ReactNode; className?: string }) {
  return <label className={`block ${className}`}><span className="mb-1.5 block text-xs font-medium text-zinc-400">{text}</span>{children}</label>;
}

function Bubble({ children, me }: { children: React.ReactNode; me?: boolean }) {
  return <div className={`max-w-[85%] rounded-lg px-3 py-2 leading-relaxed ${me ? "ml-auto rounded-br-sm bg-[#d9fdd3] text-zinc-900" : "rounded-bl-sm bg-zinc-800 text-zinc-100"}`}>{children}</div>;
}
