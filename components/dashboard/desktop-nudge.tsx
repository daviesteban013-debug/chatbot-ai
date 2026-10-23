"use client";
import { useEffect, useState } from "react";
import { BellRing } from "lucide-react";
import { DesktopDownloadLink } from "@/components/pwa/desktop-download-link";
import { desktopPlatform, type DesktopPlatform } from "@/lib/desktop-platform";

/** On «Atención humana» in a browser, while customers wait: the desktop app announces them the moment they ask. */
export function DesktopNudge({ waiting }: { waiting: number }) {
  const [platform, setPlatform] = useState<DesktopPlatform | null>(null);
  useEffect(() => {
    const detect = () => setPlatform(window.nexoDesktop ? null : desktopPlatform());
    detect();
  }, []);
  if (!platform || waiting < 1) return null;
  return (
    <p role="note" className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-[13px] text-amber-900">
      <BellRing className="size-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1">{waiting === 1 ? "Un cliente espera" : `${waiting} clientes esperan`} un asesor. Con Zorax para escritorio te habría avisado al instante, aunque tuvieras el navegador cerrado.</span>
      <DesktopDownloadLink platform={platform} tone="light" className="font-semibold! text-amber-900! underline! underline-offset-4!" />
    </p>
  );
}
