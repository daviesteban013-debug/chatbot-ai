"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowUpRight, CheckCheck, MessageCircleMore, Pause, Play, RotateCcw } from "lucide-react";

const scenarios = [
  { label: "Pedidos", business: "Casa Miga · Bogotá", result: "Pedido listo para confirmar", messages: [
    { from: "customer", text: "¡Hola! ¿Tienen desayunos para enviar?" },
    { from: "assistant", text: "¡Claro! El desayuno de la casa vale $28.000 COP. Incluye arepa, huevos y café. ¿Cuántos te preparo?" },
    { from: "customer", text: "Dos, por favor. Para recoger a las 9." },
    { from: "assistant", text: "Listo: 2 desayunos por $56.000 COP. Recogida a las 9:00 a. m. ¿Confirmamos tu pedido?" },
  ] },
  { label: "Citas", business: "Estudio Norte · Medellín", result: "Horario propuesto al cliente", messages: [
    { from: "customer", text: "¿Hay espacio para corte y barba mañana?" },
    { from: "assistant", text: "Tenemos 10:00 a. m. y 3:30 p. m. El servicio vale $45.000 COP. ¿Cuál te sirve?" },
    { from: "customer", text: "A las 3:30, a nombre de Juan." },
    { from: "assistant", text: "Perfecto, Juan. Corte y barba mañana a las 3:30 p. m. ¿Confirmas para registrar tu cita?" },
  ] },
  { label: "Cotizaciones", business: "Verde Vivo · Cali", result: "Cotización preparada", messages: [
    { from: "customer", text: "Necesito 10 plantas pequeñas para mi oficina." },
    { from: "assistant", text: "Te recomiendo las suculentas con matera: $22.000 COP cada una. Son fáciles de cuidar y ocupan poco espacio." },
    { from: "customer", text: "¿Cuánto sería con envío?" },
    { from: "assistant", text: "Las 10 suman $220.000 COP. Compárteme tu barrio y una persona del equipo confirma el costo de envío." },
  ] },
];

export function WhatsAppDemo() {
  const reduced = useReducedMotion();
  const [scenario, setScenario] = useState(0);
  const [visible, setVisible] = useState(1);
  const [paused, setPaused] = useState(false);
  const current = scenarios[scenario];
  const count = reduced ? current.messages.length : visible;
  const finished = count === current.messages.length;

  useEffect(() => {
    if (paused || reduced) return;
    const timer = window.setTimeout(() => {
      if (visible < current.messages.length) setVisible((value) => value + 1);
      else { setScenario((value) => (value + 1) % scenarios.length); setVisible(1); }
    }, visible < current.messages.length ? 2100 : 4500);
    return () => window.clearTimeout(timer);
  }, [current.messages.length, paused, reduced, scenario, visible]);

  function selectScenario(index: number) {
    setScenario(index);
    setVisible(1);
  }

  return (
    <div id="demo" className="relative mx-auto w-full max-w-[460px] min-w-0 scroll-mt-28">
      <div className="pointer-events-none absolute -inset-8 -z-10 rounded-full bg-yellow-300/8 blur-3xl" />
      <div className="mb-4 flex items-center justify-between gap-3 text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-400">
        <span className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-emerald-400" />Tu próximo cliente, bien atendido</span>
        <span className="shrink-0 text-zinc-500">Demo interactiva</span>
      </div>
      <div className="overflow-hidden rounded-[1.75rem] border border-white/15 bg-[#101b20] shadow-[0_32px_90px_#0009]">
        <div className="flex items-center gap-3 border-b border-white/5 bg-[#1b2a30] px-5 py-4">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-yellow-300 text-zinc-950"><MessageCircleMore className="size-5" /></span>
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-white">{current.business}</p><p className="mt-1 text-[11px] text-emerald-300">Asistente Nexo · En línea</p></div>
          <span className="text-[10px] text-zinc-400">WhatsApp</span>
        </div>
        <div className="flex gap-1 border-b border-white/5 px-4 py-3" aria-label="Escenario de demostración">
          {scenarios.map((item, index) => (
            <button key={item.label} type="button" aria-pressed={scenario === index} onClick={() => selectScenario(index)} className={`flex-1 rounded-lg px-2 py-2 text-xs transition ${scenario === index ? "bg-white/10 font-medium text-white" : "text-zinc-400 hover:bg-white/5 hover:text-white"}`}>{item.label}</button>
          ))}
        </div>
        <div className="min-h-[410px] space-y-3 p-4 sm:p-5" aria-label={`Conversación de ejemplo: ${current.label}`}>
          <p className="mx-auto mb-5 w-fit rounded-md bg-white/5 px-3 py-1 text-[10px] text-zinc-400">Hoy · Conversación simulada</p>
          {current.messages.slice(0, count).map((message, index) => (
            <motion.div key={`${scenario}-${index}`} initial={reduced ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className={`max-w-[92%] rounded-xl px-3.5 py-2.5 text-[13px] leading-[1.65] ${message.from === "assistant" ? "ml-auto rounded-tr-sm bg-[#075e50] text-emerald-50" : "rounded-tl-sm bg-[#24333a] text-zinc-200"}`}>
              {message.text}
              <span className="mt-1 flex items-center justify-end gap-1 text-[9px] text-white/45">10:0{index}{message.from === "assistant" && <CheckCheck className="size-3 text-sky-300" />}</span>
            </motion.div>
          ))}
          {!finished && !paused && <div aria-label="Escribiendo" className="flex w-fit items-center gap-1.5 rounded-xl bg-white/5 px-4 py-3">{[0, 1, 2].map((dot) => <motion.span key={dot} className="size-1.5 rounded-full bg-zinc-400" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1, delay: dot * 0.2 }} />)}</div>}
        </div>
        <div className="flex min-h-16 items-center justify-between gap-2 border-t border-white/5 bg-[#1b2a30] px-4 py-3">
          <p className="flex items-center gap-2 text-[11px] text-emerald-300"><ArrowUpRight className="size-4 shrink-0" />{finished ? current.result : "De un mensaje a una oportunidad"}</p>
          <div className="flex shrink-0 gap-1">
            <button type="button" onClick={() => setPaused(!paused)} disabled={!!reduced} aria-label={paused ? "Reanudar demo" : "Pausar demo"} className="rounded-lg p-2 text-zinc-300 hover:bg-white/10 disabled:opacity-40">{paused ? <Play className="size-4" /> : <Pause className="size-4" />}</button>
            <button type="button" onClick={() => { setVisible(1); setPaused(false); }} aria-label="Reiniciar demo" className="rounded-lg p-2 text-zinc-300 hover:bg-white/10"><RotateCcw className="size-4" /></button>
          </div>
        </div>
      </div>
      <p className="mt-4 text-center text-[11px] text-zinc-500">Una simulación. Sin mensajes enviados ni datos reales.</p>
    </div>
  );
}
