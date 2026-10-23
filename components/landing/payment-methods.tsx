import { ArrowLeftRight, Landmark, Link2, ShieldCheck, Smartphone, Truck, Wallet } from "lucide-react";
import { LogoLoop } from "@/components/react-bits/logo-loop";

// The payment methods an order can carry (`payment_method`); Zorax shares the store's own link or details.
const methods = [
  { id: "nequi", label: "Nequi", icon: Smartphone },
  { id: "daviplata", label: "Daviplata", icon: Wallet },
  { id: "bancolombia", label: "Bancolombia", icon: Landmark },
  { id: "pse", label: "PSE", icon: ShieldCheck },
  { id: "transferencia", label: "Transferencia", icon: ArrowLeftRight },
  { id: "contraentrega", label: "Contraentrega", icon: Truck },
  { id: "enlace", label: "Enlace de pago", icon: Link2 },
];

export function PaymentMethods() {
  return (
    <section aria-labelledby="payments-title" className="border-y border-white/8 bg-white/[0.015]">
      <div className="mx-auto grid max-w-6xl items-center gap-6 px-5 py-9 md:grid-cols-[1fr_2.4fr] md:px-8">
        <div>
          <h2 id="payments-title" className="text-sm font-medium text-zinc-200">Tus clientes pagan como ya pagan.</h2>
          <p className="mt-2 max-w-xs text-[11px] leading-relaxed text-zinc-500">Zorax comparte en el chat tu enlace o tus datos de pago. El dinero llega directo a tu negocio.</p>
        </div>
        <LogoLoop
          label="Medios de pago que Zorax puede compartir"
          items={methods.map(({ id, label, icon: Icon }) => ({
            id,
            node: <span className="flex items-center gap-2 whitespace-nowrap rounded-full border border-white/10 bg-zinc-900/60 px-4 py-2 text-sm text-zinc-300"><Icon aria-hidden="true" className="size-4 text-yellow-300" />{label}</span>,
          }))}
        />
      </div>
    </section>
  );
}
