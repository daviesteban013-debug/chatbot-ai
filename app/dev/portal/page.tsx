import { notFound } from "next/navigation";
import { WelcomePortal } from "@/app/(onboarding)/onboarding/portal";

/** Local visual fixture of the welcome portal: no account, saving fails on purpose at the end. */
export default async function Page({ searchParams }: { searchParams: Promise<{ replay?: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const replay = (await searchParams).replay === "1";
  return <WelcomePortal replay={replay} initial={replay ? { agentName: "Lía", displayName: "David", businessName: "Bellísima", businessType: "Belleza", city: "Medellín", tone: "divertido", accent: "#22d3ee", voice: false } : { displayName: "David" }}
    telemetry={{ store: replay ? "Bellísima" : null, plan: "pilot", products: replay ? 48 : 0, whatsapp: replay, email: "vista-previa@nexo.test" }} />;
}
