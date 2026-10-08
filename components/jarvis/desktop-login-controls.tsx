"use client";
import { Grip, X } from "lucide-react";
import { useDesktopMode } from "./desktop-bubble";
export function DesktopLoginControls() {
  const desktop = useDesktopMode();
  if (!desktop) return null;
  return <div style={{ position: "absolute", inset: "0 0 auto", height: 26, display: "flex", alignItems: "center", gap: 5, padding: "0 16px", color: "#a1a1aa", fontSize: 10, WebkitAppRegion: "drag" } as React.CSSProperties}>
    <Grip size={12} /><span>NEXO · Acceso</span><button type="button" aria-label="Salir de NEXO" onClick={() => void window.nexoDesktop?.quit()} style={{ marginLeft: "auto", background: "transparent", border: 0, color: "inherit", cursor: "pointer", WebkitAppRegion: "no-drag" } as React.CSSProperties}><X size={13} /></button>
  </div>;
}
