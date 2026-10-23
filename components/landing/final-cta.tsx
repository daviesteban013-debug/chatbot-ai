import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { MoltenMetal } from "@/components/react-bits/backgrounds/molten-metal";
import { Magnet } from "@/components/react-bits/magnet";

export function FinalCta() {
  return (
    <section className="px-4 pb-20 pt-6 sm:px-8" aria-labelledby="final-title">
      <div className="relative isolate mx-auto max-w-6xl overflow-hidden rounded-[2.5rem] border border-yellow-200/15 bg-[#070605] px-6 py-20 text-center shadow-[0_40px_120px_-48px_rgba(250,204,21,0.45)] sm:px-12 sm:py-28">
        {/* Molten gold (React Bits «Molten Metal») under a shade that keeps the copy legible. */}
        <div aria-hidden="true" className="absolute inset-0 -z-10">
          <MoltenMetal colors={["#6b3f04", "#d97706", "#facc15"]} coreColor="#fffbeb" speed={0.3} scale={3} glow={2} brightness={1.8} haze={0.85} grain={0.04} dpr={1.5} />
        </div>
        <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_50%_46%_at_50%_50%,rgb(7_6_5/0.66),rgb(7_6_5/0.18)_72%,transparent)]" />

        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-yellow-200/80">Tu próximo comprador no quiere esperar</p>
        <h2 id="final-title" className="mx-auto mt-5 max-w-3xl text-balance text-4xl font-semibold leading-[1.04] tracking-[-0.05em] text-white sm:text-6xl">
          Tu siguiente paso<br />empieza con <span className="rb-gradient-text">Zorax.</span>
        </h2>
        <p className="mx-auto mt-6 max-w-lg text-sm leading-7 text-zinc-300">
          Conecta tu catálogo, atiende a tus compradores por WhatsApp y convierte cada conversación en un pedido.
        </p>
        <Magnet className="relative mt-9">
          <Link href="/signup" className="landing-primary rb-glare min-h-12! px-7! text-sm!">
            Empieza gratis <ArrowRight className="size-4" />
          </Link>
        </Magnet>
        <p className="mt-6 flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs text-zinc-400">
          {["Sin tarjeta de crédito", "Sin programar", "Cancelas cuando quieras"].map((text) => (
            <span key={text} className="flex items-center gap-1.5">
              <Check className="size-3.5 text-yellow-300" />
              {text}
            </span>
          ))}
        </p>
      </div>
    </section>
  );
}
