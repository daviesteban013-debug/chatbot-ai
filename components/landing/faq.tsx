"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";

const questions = [
  ["¿Necesito saber de tecnología?", "No necesitas programar. Configuras los datos de tu negocio, catálogo, horarios y reglas desde el panel. La conexión de WhatsApp Business puede requerir pasos de verificación de Meta."],
  ["¿Cómo funciona con las reglas de WhatsApp?", "La conexión se realiza a través de la API de WhatsApp Business de Meta. Debes contar con los permisos y consentimientos necesarios y respetar sus políticas, ventanas de atención y reglas de plantillas. Usar Nexo no garantiza por sí solo el cumplimiento ni la aprobación de una cuenta."],
  ["¿Puedo pasar la conversación a una persona?", "Sí. El flujo permite derivar conversaciones al equipo cuando el cliente lo solicita o cuando el caso requiere revisión. Define las reglas de atención y revisa los casos pendientes desde tu panel."],
  ["¿Nexo puede inventar precios o confirmar cualquier pedido?", "Configura el catálogo y las reglas que debe seguir. Para acciones sensibles, utiliza revisión humana y prueba las respuestas antes de activar la automatización. Como cualquier sistema de IA, puede cometer errores."],
  ["¿Puedo cancelar cuando quiera?", "Explorar esta demo y crear una cuenta no activa un cobro. Los planes mostrados son ilustrativos; las condiciones de cancelación, renovación y reembolso deberán estar disponibles para tu aceptación antes de cualquier contratación."],
  ["¿Los mensajes de Meta están incluidos?", "No en los precios ilustrativos de esta página. Los cargos de WhatsApp Business pueden variar según el tipo de mensaje y las tarifas de Meta. Confirma el costo total y los límites antes de contratar."],
];

export function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="faq" className="landing-section grid gap-10 border-t border-white/8 lg:grid-cols-[0.85fr_1.15fr]" aria-labelledby="faq-title">
      <div><p className="landing-eyebrow">Hablemos claro</p><h2 id="faq-title" className="landing-title">Buenas preguntas.<br />Respuestas directas.</h2><p className="landing-copy">Antes de darle las llaves de tu WhatsApp a un asistente, es normal querer saber más.</p><Link href="/signup" className="landing-secondary mt-6">Explora Nexo gratis <ArrowRight className="size-4" /></Link></div>
      <div>{questions.map(([question, answer], index) => <div key={question} className="border-b border-white/10 first:border-t">
        <h3><button id={`faq-button-${index}`} type="button" aria-expanded={open === index} aria-controls={`faq-answer-${index}`} onClick={() => setOpen(open === index ? null : index)} className="flex w-full items-center justify-between gap-5 py-6 text-left text-sm font-medium text-zinc-200"><span>{question}</span><Plus className={`size-4 shrink-0 text-yellow-300 transition-transform ${open === index ? "rotate-45" : ""}`} /></button></h3>
        <div id={`faq-answer-${index}`} role="region" aria-labelledby={`faq-button-${index}`} hidden={open !== index}><p className="pb-6 pr-6 text-sm leading-7 text-zinc-400">{answer}</p></div>
      </div>)}</div>
    </section>
  );
}
