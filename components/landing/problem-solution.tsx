import Link from "next/link";
import { ArrowRight, Check, Clock3, MessageSquareOff, Wallet } from "lucide-react";
import { ScrollReveal } from "@/components/react-bits/scroll-reveal";

const problems = [
  { icon: Clock3, title: "Respondes cuando puedes.", copy: "Tu cliente quiere saber el precio y si hay su talla ahora, no cuando por fin revises el chat." },
  { icon: MessageSquareOff, title: "El chat se llena. Los carritos se enfrían.", copy: "Entre audios y mensajes, una compra interesada queda sin respuesta y se va a otra tienda." },
  { icon: Wallet, title: "Tu tiempo también cuesta.", copy: "Repetir tallas, precios, stock y costos de envío no debería ocupar tu día." },
];

export function ProblemSolution() {
  return (
    <section className="landing-section" aria-labelledby="problema-title">
      <p className="landing-eyebrow">Tu tienda crece. Tu día no.</p>
      <h2 id="problema-title" className="landing-title"><ScrollReveal lines={["Que un mensaje sin responder", "no sea una venta perdida."]} accent={2} breakClassName="hidden sm:block" /></h2>
      <div className="mt-10 grid gap-4 md:grid-cols-2">
        <div className="rounded-3xl border border-white/10 bg-zinc-900/40 p-6 backdrop-blur-md sm:p-8">
          <p className="mb-8 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Sin una mano extra</p>
          <div className="space-y-7">{problems.map(({ icon: Icon, title, copy }) => <div key={title} className="flex gap-4"><Icon className="mt-1 size-5 shrink-0 text-zinc-500" /><div><h3 className="text-sm font-medium text-zinc-200">{title}</h3><p className="mt-2 text-sm leading-relaxed text-zinc-500">{copy}</p></div></div>)}</div>
        </div>
        <div className="cyber-card relative overflow-hidden rounded-3xl border border-yellow-300/30 bg-[radial-gradient(ellipse_at_top_right,#facc1515,transparent_70%)] bg-zinc-950/70 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.5)] backdrop-blur-xl sm:p-8">
          <p className="mb-8 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-yellow-300">
            <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
            Con Zorax de tu lado
          </p>
          <div className="space-y-7">{[
            ["Una respuesta, sin hacer esperar.", "Zorax atiende las preguntas de tus compradores con la información de tu catálogo."],
            ["Cada intención tiene un siguiente paso.", "Consulta stock, cotiza el envío y deja el pedido listo para pagar en el mismo chat."],
            ["Automatiza lo repetitivo. Conserva el control.", "Tu equipo interviene cuando hace falta. Tú te enfocas en atender y crecer."],
          ].map(([title, copy]) => <div key={title} className="flex gap-4"><span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-yellow-300/10 border border-yellow-300/20"><Check className="size-3.5 text-yellow-300" /></span><div><h3 className="text-sm font-medium text-white">{title}</h3><p className="mt-2 text-sm leading-relaxed text-zinc-400">{copy}</p></div></div>)}</div>
        </div>
      </div>
      <Link href="/signup" className="landing-secondary mt-8">Deja de perder ventas en el chat <ArrowRight className="size-4" /></Link>
    </section>
  );
}
