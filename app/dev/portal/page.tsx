import { notFound } from "next/navigation";
import { WelcomePortal } from "@/app/(onboarding)/onboarding/portal";

/**
 * Local visual fixture of the welcome portal: no account, so saving fails at the end unless
 * `?dry=1` skips it; `?scene=10` starts at the last question to reach the exit sequence quickly.
 */
export default async function Page({ searchParams }: { searchParams: Promise<{ replay?: string; dry?: string; scene?: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const params = await searchParams;
  const replay = params.replay === "1";
  const fixture = { dryRun: params.dry === "1", startAt: params.scene ? Number(params.scene) || 0 : 0 };
  return <WelcomePortal replay={replay} fixture={fixture} voiceAvailability={{ elevenLabs: false }} initial={replay ? { agentName: "Lía", displayName: "David", businessName: "Bellísima", businessType: "Belleza", city: "Medellín", tone: "divertido", accent: "#22d3ee", voice: false } : { displayName: "David" }}
    telemetry={{ store: replay ? "Bellísima" : null, plan: "pilot", products: replay ? 48 : 0, whatsapp: replay, email: "vista-previa@nexo.test" }} />;
}
