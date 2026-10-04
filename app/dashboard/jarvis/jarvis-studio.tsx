"use client";

import { useState, useTransition } from "react";
import { Bot, Check, CheckCircle2, MessageCircle, Save, Sparkles, TriangleAlert, Wand2 } from "lucide-react";
import { plans } from "@/lib/plans";
import type { JarvisConfig as Config } from "@/lib/jarvis";
import { saveJarvisConfig } from "./actions";

const tones = [
  { id: "cercano", label: "Cercano", sample: "¡Hola! 😊 Claro que sí, con gusto te ayudo con eso." },
  { id: "profesional", label: "Profesional", sample: "Buen día. Con gusto le colaboro con su solicitud." },
  { id: "divertido", label: "Divertido", sample: "¡Ey! 🚀 Llegaste al lugar correcto, vamos a resolverlo." },
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


const field = "w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-yellow-300 focus:ring-2 focus:ring-yellow-300/20";

export function JarvisStudio({ initial, plan, justPaid, claimError }: { initial: Config; plan?: string; justPaid: boolean; claimError: string | null }) {
  const [cfg, setCfg] = useState<Config>(initial);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pending, startSave] = useTransition();
  const planInfo = plans.find((p) => p.id === plan);

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
      if (res.ok) setSaved(true);
      else setSaveError(res.error);
    });
  }

  const tone = tones.find((t) => t.id === cfg.tone) ?? tones[0];
  const welcome = cfg.welcome.replaceAll("{agente}", cfg.name || "Jarvis").replaceAll("{negocio}", cfg.business || "tu negocio");

  return (
    <div className="landing-root cyber-grid-pattern min-h-svh px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-6xl">
        {justPaid && (
          <div role="status" className="mb-6 flex items-center gap-3 rounded-2xl border border-yellow-300/40 bg-yellow-300/10 p-4 text-sm text-yellow-100">
            <CheckCircle2 className="size-5 shrink-0 text-yellow-300" />
            <span>¡Pago recibido{planInfo ? ` — plan ${planInfo.name} activo` : ""}! Ahora dale personalidad a tu agente.</span>
          </div>
        )}
        {claimError && (
          <div role="alert" className="mb-6 flex items-center gap-3 rounded-2xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200">
            <TriangleAlert className="size-5 shrink-0 text-red-300" />
            <span>No pudimos activar tu plan: {claimError}</span>
          </div>
        )}

        <header>
          <p className="landing-eyebrow">Jarvis · Estudio del agente</p>
          <h1 className="landing-title">Diseña el asistente de tu negocio.</h1>
          <p className="landing-copy">Define su nombre, tono y reglas. Mira en vivo cómo respondería en WhatsApp.</p>
        </header>

        <div className="mt-10 grid gap-6 lg:grid-cols-[1.25fr_.75fr]">
          <div className="space-y-5">
            <Card title="Identidad" icon={<Bot className="size-4" />}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Label text="Nombre del agente"><input className={field} value={cfg.name} onChange={(e) => set("name", e.target.value)} maxLength={24} /></Label>
                <Label text="Nombre de tu negocio"><input className={field} value={cfg.business} onChange={(e) => set("business", e.target.value)} placeholder="Ej. Café La Esquina" maxLength={48} /></Label>
              </div>
              <div className="mt-5">
                <p className="mb-2 text-xs font-medium text-zinc-400">Color</p>
                <div className="flex gap-3">
                  {accents.map((c) => (
                    <button key={c} type="button" aria-label={`Color ${c}`} aria-pressed={cfg.accent === c} onClick={() => set("accent", c)} style={{ background: c }} className={`size-8 rounded-full ring-offset-2 ring-offset-zinc-950 transition ${cfg.accent === c ? "ring-2 ring-white" : "opacity-70 hover:opacity-100"}`} />
                  ))}
                </div>
              </div>
            </Card>

            <Card title="Tono de voz" icon={<Sparkles className="size-4" />}>
              <div className="grid gap-3 sm:grid-cols-2">
                {tones.map((t) => (
                  <button key={t.id} type="button" aria-pressed={cfg.tone === t.id} onClick={() => set("tone", t.id)} className={`rounded-xl border p-4 text-left transition ${cfg.tone === t.id ? "border-yellow-300/70 bg-yellow-300/10" : "border-zinc-800 bg-zinc-950 hover:border-zinc-600"}`}>
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

            <Card title="Capacidades" icon={<Wand2 className="size-4" />}>
              <div className="space-y-2">
                {abilities.map((a) => {
                  const on = cfg.abilities.includes(a.id);
                  return (
                    <button key={a.id} type="button" role="switch" aria-checked={on} onClick={() => toggle(a.id)} className="flex w-full items-center justify-between rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-left text-sm text-zinc-200 transition hover:border-zinc-600">
                      {a.label}
                      <span className={`flex h-6 w-11 items-center rounded-full p-0.5 transition ${on ? "bg-yellow-300" : "bg-zinc-700"}`}><span className={`size-5 rounded-full bg-zinc-950 transition ${on ? "translate-x-5" : ""}`} /></span>
                    </button>
                  );
                })}
              </div>
              <Label text={`Descuento máximo que puede ofrecer: ${cfg.maxDiscount}%`} className="mt-5">
                <input type="range" min={0} max={30} value={cfg.maxDiscount} onChange={(e) => set("maxDiscount", Number(e.target.value))} className="w-full accent-yellow-300" />
              </Label>
            </Card>

            <Card title="Reglas del negocio" icon={<Check className="size-4" />}>
              <textarea className={`${field} min-h-32 resize-y`} value={cfg.rules} onChange={(e) => set("rules", e.target.value)} placeholder={"Horario: lunes a sábado 8am–6pm\nEnvíos solo en Bogotá\nNo aceptamos devoluciones de comida"} maxLength={1500} />
            </Card>

            <button type="button" onClick={save} disabled={pending} className="landing-primary w-full disabled:opacity-60 sm:w-auto">
              {pending ? "Guardando…" : saved ? <><Check className="size-4" />Guardado</> : <><Save className="size-4" />Guardar configuración</>}
            </button>
            {saveError && <p role="alert" className="text-xs text-red-300">{saveError}</p>}
          </div>

          {/* Vista previa */}
          <aside className="lg:sticky lg:top-8 lg:self-start">
            <div className="overflow-hidden rounded-3xl border border-white/10 bg-zinc-900/60 backdrop-blur-xl" style={{ boxShadow: `0 0 60px ${cfg.accent}22` }}>
              <div className="flex items-center gap-3 border-b border-white/10 bg-zinc-900 px-5 py-4">
                <span className="flex size-10 items-center justify-center rounded-full text-zinc-950" style={{ background: cfg.accent }}><Bot className="size-5" /></span>
                <div><p className="text-sm font-medium text-white">{cfg.name || "Jarvis"}</p><p className="text-[11px] text-emerald-400">en línea</p></div>
                <MessageCircle className="ml-auto size-4 text-zinc-600" />
              </div>
              <div className="space-y-3 p-5 text-sm">
                <Bubble>{welcome}</Bubble>
                <Bubble me>¿Tienen domicilio?</Bubble>
                <Bubble>{tone.sample}</Bubble>
              </div>
              <p className="border-t border-white/10 px-5 py-3 text-[11px] text-zinc-500">Vista previa ilustrativa · {cfg.abilities.length} capacidades activas{planInfo ? ` · Plan ${planInfo.name}` : ""}</p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function Card({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-white/10 bg-zinc-900/50 p-6 backdrop-blur-xl">
      <h2 className="mb-5 flex items-center gap-2 text-sm font-medium text-white"><span className="text-yellow-300">{icon}</span>{title}</h2>
      {children}
    </section>
  );
}

function Label({ text, children, className = "" }: { text: string; children: React.ReactNode; className?: string }) {
  return <label className={`block ${className}`}><span className="mb-2 block text-xs font-medium text-zinc-400">{text}</span>{children}</label>;
}

function Bubble({ children, me }: { children: React.ReactNode; me?: boolean }) {
  return <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 leading-relaxed ${me ? "ml-auto rounded-br-sm bg-yellow-300 text-zinc-950" : "rounded-bl-sm bg-zinc-800 text-zinc-100"}`}>{children}</div>;
}
