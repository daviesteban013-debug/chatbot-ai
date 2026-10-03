import { redirect } from "next/navigation";
import { FuturisticBackground3D } from "@/components/landing/futuristic-background-3d";
import { JarvisHero } from "@/components/landing/jarvis-hero";
import { LandingNavbar } from "@/components/landing/navbar";
import { SocialProof } from "@/components/landing/social-proof";
import { ProblemSolution } from "@/components/landing/problem-solution";
import { Features } from "@/components/landing/features";
import { HowItWorks } from "@/components/landing/how-it-works";
import { Testimonials } from "@/components/landing/testimonials";
import { Pricing } from "@/components/landing/pricing";
import { Faq } from "@/components/landing/faq";
import { FinalCta } from "@/components/landing/final-cta";
import { LandingFooter } from "@/components/landing/footer";

export default async function HomePage({
  searchParams,
}: {
  // En Next.js 16 `searchParams` es una promesa y debe esperarse.
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  // Supabase devuelve al `site_url` con `error`/`error_code` cuando un enlace
  // de confirmación falla o expira; los reenviamos al login para mostrar un
  // mensaje claro en vez de dejarlos perdidos en la landing.
  const raw = params.error_code ?? params.error;
  const error = Array.isArray(raw) ? raw[0] : raw;
  if (error) {
    redirect(`/login?error=${encodeURIComponent(error)}`);
  }

  return (
    <div className="landing-root relative min-h-screen overflow-x-hidden">
      {/* 3D Dynamic WebGL Futuristic Interactive Background */}
      <FuturisticBackground3D />
      <a href="#contenido" className="sr-only z-[60] rounded-lg bg-yellow-300 p-3 text-zinc-950 focus:fixed focus:left-4 focus:top-4 focus:not-sr-only">Saltar al contenido</a>
      <LandingNavbar />
      <main id="contenido" className="relative z-10">
        <JarvisHero />
        <SocialProof />
        <ProblemSolution />
        <Features />
        <HowItWorks />
        <Testimonials />
        <Pricing />
        <Faq />
        <FinalCta />
      </main>
      <LandingFooter />
    </div>
  );
}
