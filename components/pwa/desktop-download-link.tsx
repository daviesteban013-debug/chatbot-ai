import { Download } from "lucide-react";
import { desktopRelease, macDesktopRelease } from "@/lib/desktop-release";

export function DesktopDownloadLink({ className = "", compact = false, platform = "windows", tone = "dark" }: { className?: string; compact?: boolean; platform?: "windows" | "mac"; tone?: "dark" | "light" }) {
  const release = platform === "mac" ? macDesktopRelease : desktopRelease;
  const label = platform === "mac" ? "Mac" : "Windows";
  const detail = platform === "mac" ? `${macDesktopRelease.systemLabel} · Beta sin notarización de Apple` : `Windows 10/11 de 64 bits · ${desktopRelease.sizeLabel}`;
  return <a href={release.url} download={release.filename} aria-label={`Descargar Zorax para ${label}`} title={`Zorax ${release.version} · ${detail}`}
    className={`inline-flex items-center gap-2 text-xs font-medium transition ${tone === "light" ? "justify-start rounded-md px-2.5 py-1.5 text-ink-soft hover:bg-subtle hover:text-ink" : "justify-center rounded-xl border border-yellow-300/25 bg-yellow-300/10 px-3 py-2.5 text-yellow-200 hover:bg-yellow-300/20"} ${className}`}>
    <Download className="size-4 shrink-0" /><span className={compact ? "sr-only sm:not-sr-only" : ""}>{compact ? label : `Descargar Zorax para ${label}`}{platform === "mac" && " · beta"}</span>
  </a>;
}
