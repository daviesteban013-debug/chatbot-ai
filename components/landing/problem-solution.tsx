import Link from "next/link";
import { ArrowRight, Check, Clock3, MessageSquareOff, Wallet } from "lucide-react";

const problems = [
  { icon: Clock3, title: "Respondes cuando puedes.", copy: "Tu cliente necesita saber el precio ahora, no al cerrar el local." },
  { icon: MessageSquareOff, title: "El chat se llena. Los pedidos se pierden.", copy: "Entre audios y mensajes, una compra interesada queda sin respuesta." },
  { icon: Wallet, title: "Tu tiempo también cuesta.", copy: "Repetir horarios, precios y disponibilidad no debería ocupar tu día." },
];

export function ProblemSolution() {
  return (
    <section className="landing-section" aria-labelledby="problema-title">
      <p className="landing-eyebrow">Tu negocio crece. Tu día no.</p>
      <h2 id="problema-title" className="landing-title">Que un mensaje sin responder<br className="hidden sm:block" /> no sea una venta perdida.</h2>
      <div className="mt-10 grid gap-4 md:grid-cols-2">
        <div className="rounded-3xl border border-white/10 bg-zinc-900/40 p-6 backdrop-blur-md sm:p-8">
          <p className="mb-8 text-xs font-mono uppercase tracking-widest text-zinc-500">{"// Sin una mano extra"}</p>
          <div className="space-y-7">{problems.map(({ icon: Icon, title, copy }) => <div key={title} className="flex gap-4"><Icon className="mt-1 size-5 shrink-0 text-zinc-500" /><div><h3 className="text-sm font-medium text-zinc-200">{title}</h3><p className="mt-2 text-sm leading-relaxed text-zinc-500">{copy}</p></div></div>)}</div>
        </div>
        <div className="cyber-card relative overflow-hidden rounded-3xl border border-yellow-300/30 bg-[radial-gradient(ellipse_at_top_right,#facc1515,transparent_70%)] bg-zinc-950/70 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.5)] backdrop-blur-xl sm:p-8">
          <div className="scanner-line opacity-30" />
          <p className="mb-8 flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-yellow-300">
            <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
            {"// Con Nexo de tu lado"}
          </p>
          <div className="space-y-7">{[
            ["Una respuesta, sin hacer esperar.", "Nexo atiende las preguntas frecuentes con la información de tu negocio."],
            ["Cada intención tiene un siguiente paso.", "Organiza pedidos, propone citas y prepara cotizaciones en el mismo chat."],
            ["Automatiza lo repetitivo. Conserva el control.", "Tu equipo interviene cuando hace falta. Tú te enfocas en atender y crecer."],
          ].map(([title, copy]) => <div key={title} className="flex gap-4"><span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-yellow-300/10 border border-yellow-300/20"><Check className="size-3.5 text-yellow-300" /></span><div><h3 className="text-sm font-medium text-white">{title}</h3><p className="mt-2 text-sm leading-relaxed text-zinc-400">{copy}</p></div></div>)}</div>
        </div>
      </div>
      <Link href="/signup" className="landing-secondary mt-8">Recupera tiempo para tu negocio <ArrowRight className="size-4" /></Link>
    </section>
  );
}
