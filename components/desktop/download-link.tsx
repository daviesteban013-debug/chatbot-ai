import { Download } from "lucide-react";
import { desktopRelease } from "@/lib/desktop-release";

export function DesktopDownloadLink({ className = "", compact = false }: { className?: string; compact?: boolean }) {
  return <a href={desktopRelease.url} download={desktopRelease.filename} aria-label="Descargar NEXO para Windows" title={`NEXO ${desktopRelease.version} · Windows 10/11 de 64 bits · ${desktopRelease.sizeLabel}`}
    className={`inline-flex items-center justify-center gap-2 rounded-xl border border-yellow-300/25 bg-yellow-300/10 px-3 py-2.5 text-xs font-medium text-yellow-200 transition hover:bg-yellow-300/20 ${className}`}>
    <Download className="size-4 shrink-0" /><span className={compact ? "sr-only sm:not-sr-only" : ""}>{compact ? "Windows" : "Descargar NEXO para Windows"}</span>
  </a>;
}
