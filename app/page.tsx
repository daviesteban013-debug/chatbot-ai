import { redirect } from "next/navigation";
import { JarvisHero } from "@/components/landing/jarvis-hero";
import { LandingNavbar } from "@/components/landing/navbar";

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
    <>
      <LandingNavbar />
      <JarvisHero />
    </>
  );
}
