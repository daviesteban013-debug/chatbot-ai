import Link from "next/link";
import { ArrowRight, BarChart3, Check, Handshake, PackageCheck, ShoppingBag, Truck } from "lucide-react";
import { SpotlightCard } from "@/components/react-bits/spotlight-card";

const features = [
  { icon: ShoppingBag, title: "Del ‘¿tienes?’ al ‘lo quiero’.", copy: "Consulta talla, color y stock, y arma el pedido con productos, cantidades y datos de envío sin perder el hilo.", kind: "orders", label: "Pedidos organizados", wide: true },
  { icon: Truck, title: "Envíos y pagos, sin perseguir al cliente.", copy: "Pide la dirección, calcula el envío, comparte el link o los datos de pago y hace el seguimiento.", kind: "payments", label: "Envío y cobro" },
  { icon: PackageCheck, title: "Tu catálogo sabe conversar.", copy: "Recomienda productos según lo que busca cada cliente, con tus precios, fotos y reglas.", kind: "catalog", label: "Recomendaciones útiles" },
  { icon: Handshake, title: "La última palabra es tuya.", copy: "Pasa la conversación a tu equipo cuando el cliente lo pida o el caso lo necesite.", kind: "handoff", label: "Control humano" },
  { icon: BarChart3, title: "Menos intuición. Más claridad.", copy: "Consulta conversaciones, pedidos y actividad desde un solo panel.", kind: "analytics", label: "Datos para decidir" },
];

function Illustration({ kind }: { kind: string }) {
  return (
    <div aria-hidden="true" className="landing-illustration mt-7 flex h-28 items-end gap-3 overflow-hidden rounded-xl border border-white/5 bg-black/20 p-4">
      {kind === "orders" && <><div className="min-w-0 flex-1 rounded-lg border border-white/10 bg-zinc-900 p-3"><p className="text-[10px] text-zinc-500">PEDIDO #024</p><p className="mt-2 text-xs text-zinc-300">1 × Chaqueta bomber · M</p><p className="mt-2 text-xs text-white">$149.000 COP</p></div><span className="mb-2 flex items-center gap-1.5 rounded-full bg-emerald-400/10 px-3 py-2 text-[10px] text-emerald-300"><Check className="size-3" />Por confirmar</span></>}
      {kind === "payments" && ["Envío", "Link de pago", "Pagado"].map((step, index) => <div key={step} className={`flex h-16 flex-1 items-center justify-center rounded-lg border px-1 text-center text-xs ${index === 1 ? "border-yellow-300/30 bg-yellow-300/10 text-yellow-300" : "border-white/10 text-zinc-500"}`}>{step}</div>)}
      {kind === "catalog" && ["Chaqueta", "Tenis", "Bolso"].map((label, index) => <div key={label} className="flex h-20 flex-1 flex-col items-center justify-center gap-2 rounded-lg bg-white/5"><span className={`h-6 w-6 rounded-lg ${index === 2 ? "bg-yellow-300/70" : "bg-zinc-600"}`} /><span className="text-[10px] text-zinc-400">{label}</span></div>)}
      {kind === "handoff" && <><span className="flex size-12 items-center justify-center rounded-full border border-yellow-300/30 bg-yellow-300/10 text-xs text-yellow-300">Zorax</span><div className="mb-6 h-px flex-1 bg-gradient-to-r from-yellow-300/50 to-emerald-300/50" /><span className="flex size-12 items-center justify-center rounded-full border border-emerald-300/30 bg-emerald-300/10 text-xs text-emerald-300">Tú</span></>}
      {kind === "analytics" && [35, 56, 42, 68, 60, 85, 100].map((height, index) => <span key={index} className={`flex-1 rounded-t ${index === 6 ? "bg-yellow-300" : "bg-yellow-300/20"}`} style={{ height: `${height}%` }} />)}
    </div>
  );
}

export function Features() {
  return (
    <section id="producto" className="landing-section border-t border-white/8" aria-labelledby="features-title">
      <div className="flex flex-wrap items-end justify-between gap-6"><div><p className="landing-eyebrow">Una conversación. Muchas posibilidades.</p><h2 id="features-title" className="landing-title">No es otro chatbot.<br />Es parte de tu equipo.</h2></div><Link href="/signup" className="landing-secondary">Conoce tu asistente <ArrowRight className="size-4" /></Link></div>
      <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {features.map(({ icon: Icon, title, copy, kind, label, wide }) => (
          <SpotlightCard
            as="article"
            key={kind}
            className={`landing-feature cyber-card group relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-zinc-900/85 via-zinc-900/40 to-black/60 p-6 backdrop-blur-xl ${
              wide ? "md:col-span-2" : ""
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-xl bg-yellow-400/10 border border-yellow-400/20 text-yellow-300">
                <Icon className="size-4" />
              </span>
              <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-500">{label}</span>
            </div>
            <h3 className="mt-5 text-xl font-medium tracking-tight text-white">{title}</h3>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-zinc-400">{copy}</p>
            <Illustration kind={kind} />
          </SpotlightCard>
        ))}
      </div>
      <p className="mt-4 text-[11px] text-zinc-500">Vistas ilustrativas. La disponibilidad depende de tu configuración y de las integraciones activas.</p>
    </section>
  );
}
