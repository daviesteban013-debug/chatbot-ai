import { Quote } from "lucide-react";

const stories = [
  { name: "Laura M.", initials: "LM", business: "Panadería · Bogotá", number: "18 pedidos", result: "organizados en una mañana", quote: "Mientras preparo los pedidos, el asistente responde por desayunos y recoge las cantidades. Ya no tengo que parar para contestar lo mismo." },
  { name: "Andrés R.", initials: "AR", business: "Barbería · Medellín", number: "12 citas", result: "gestionadas en un día", quote: "El cliente ve los horarios y confirma por el chat. Yo me concentro en quien está en la silla, sin dejar esperando al próximo." },
  { name: "Camila P.", initials: "CP", business: "Tienda de plantas · Cali", number: "3 horas", result: "liberadas de tareas repetitivas", quote: "Nexo muestra las opciones y prepara la cotización. Si una compra necesita asesoría especial, la conversación pasa a mi equipo." },
];

export function Testimonials() {
  return (
    <section className="border-y border-white/8 bg-white/[0.015]" aria-labelledby="stories-title">
      <div className="landing-section">
        <p className="landing-eyebrow">Historias que podrías hacer tuyas</p><h2 id="stories-title" className="landing-title">Menos pendiente del celular.<br />Más presente en tu negocio.</h2>
        <p className="landing-copy">Casos ficticios para ilustrar el producto. Nombres, testimonios y cifras son ejemplos, no reseñas de clientes reales.</p>
        <div className="mt-10 grid gap-4 lg:grid-cols-3">{stories.map((story) => <figure key={story.name} className="flex flex-col rounded-3xl border border-white/10 bg-zinc-950 p-6 sm:p-7">
          <div className="flex items-center justify-between"><Quote className="size-6 text-yellow-300/50" /><span className="rounded-full border border-white/10 px-2 py-1 text-[9px] uppercase tracking-widest text-zinc-500">Caso ilustrativo</span></div>
          <p className="mt-6 text-3xl font-medium tracking-tight text-yellow-300">{story.number}</p><p className="mt-1 text-xs text-zinc-500">{story.result}</p>
          <blockquote className="mb-8 mt-6 flex-1 text-sm leading-7 text-zinc-300">“{story.quote}”</blockquote>
          <figcaption className="flex items-center gap-3 border-t border-white/10 pt-5"><span className="flex size-10 items-center justify-center rounded-full bg-zinc-800 text-xs text-zinc-300">{story.initials}</span><span><span className="block text-sm font-medium">{story.name}</span><span className="mt-1 block text-xs text-zinc-500">{story.business}</span></span></figcaption>
        </figure>)}</div>
      </div>
    </section>
  );
}
