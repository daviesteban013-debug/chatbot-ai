import { notFound } from "next/navigation";
import { NexoDesktopPreview } from "./preview";
import { JarvisView } from "@/app/dashboard/jarvis/jarvis-view";
import { jarvisDefaults } from "@/lib/jarvis";
import { personalizationDefaults } from "@/lib/jarvis-personalization";
export default async function Page({ searchParams }: { searchParams: Promise<{ experience?: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  if ((await searchParams).experience === "1") return <JarvisView initial={jarvisDefaults} initialProfile={{ ...personalizationDefaults, voice: { ...personalizationDefaults.voice, enabled: false } }} voiceAvailability={{ elevenLabs: false }} justPaid={false} claimError={null} />;
  return <NexoDesktopPreview />;
}
