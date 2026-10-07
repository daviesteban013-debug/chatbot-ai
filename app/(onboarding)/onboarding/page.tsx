import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentTenant, getCurrentUser } from "@/lib/auth";
import { OnboardingChat } from "./onboarding-chat";

export const metadata: Metadata = {
  title: "Configura tu asistente — Chatbot.ai",
  description:
    "NEXO te guía paso a paso para dejar tu agente de ventas listo.",
};

/**
 * Página de onboarding (Server Component).
 *  - Sin sesión -> /login
 *  - Sin tenant  -> /login (no debería ocurrir tras el signup)
 *  - En otro caso, renderiza el chat conversacional de Jarvis.
 */
export default async function OnboardingPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const current = await getCurrentTenant();
  if (!current) {
    redirect("/login");
  }

  return <OnboardingChat />;
}
