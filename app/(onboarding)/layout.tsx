import type { ReactNode } from "react";
import { Bricolage_Grotesque } from "next/font/google";

/** Display font for the portal, paired with Inter (root layout); `--font-display` reaches every child page. */
const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-display", weight: ["600", "700", "800"], display: "swap" });

/** The welcome portal owns the whole screen: dark, no CRM chrome, NEXO's own light. */
export default function OnboardingLayout({ children }: { children: ReactNode }) {
  return <div className={`relative min-h-svh overflow-hidden bg-[#07080b] text-zinc-100 ${display.variable}`}>{children}</div>;
}
