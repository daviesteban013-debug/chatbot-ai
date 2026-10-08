import { Download } from "lucide-react";
import { desktopRelease, macDesktopRelease } from "@/lib/desktop-release";

export function DesktopDownloadLink({ className = "", compact = false, platform = "windows" }: { className?: string; compact?: boolean; platform?: "windows" | "mac" }) {
  const release = platform === "mac" ? macDesktopRelease : desktopRelease;
  const label = platform === "mac" ? "Mac" : "Windows";
  const detail = platform === "mac" ? `${macDesktopRelease.systemLabel} · Beta sin notarización de Apple` : `Windows 10/11 de 64 bits · ${desktopRelease.sizeLabel}`;
  return <a href={release.url} download={release.filename} aria-label={`Descargar NEXO para ${label}`} title={`NEXO ${release.version} · ${detail}`}
    className={`inline-flex items-center justify-center gap-2 rounded-xl border border-yellow-300/25 bg-yellow-300/10 px-3 py-2.5 text-xs font-medium text-yellow-200 transition hover:bg-yellow-300/20 ${className}`}>
    <Download className="size-4 shrink-0" /><span className={compact ? "sr-only sm:not-sr-only" : ""}>{compact ? label : `Descargar NEXO para ${label}`}{platform === "mac" && " · beta"}</span>
  </a>;
}
