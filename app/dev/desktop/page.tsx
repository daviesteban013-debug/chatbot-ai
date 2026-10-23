import { notFound } from "next/navigation";
import { DesktopAppCard } from "@/components/dashboard/desktop-app-card";
import { DesktopNudge } from "@/components/dashboard/desktop-nudge";

/**
 * Local visual fixture of the invitations to the desktop app that the CRM shows in a browser:
 * the home card and the reminder on «Atención humana» (`?waiting=3` sets how many customers wait).
 */
export default async function Page({ searchParams }: { searchParams: Promise<{ waiting?: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { waiting } = await searchParams;
  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <DesktopAppCard />
      <DesktopNudge waiting={Number(waiting ?? 2) || 0} />
    </div>
  );
}
