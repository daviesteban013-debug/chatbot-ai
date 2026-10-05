import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Jarvis · Tu centro de mando",
    short_name: "Jarvis",
    description: "Tu agente de voz y tu CRM, en un mismo lugar.",
    lang: "es-CO",
    start_url: "/dashboard/jarvis",
    scope: "/",
    display: "standalone",
    background_color: "#09090b",
    theme_color: "#09090b",
    prefer_related_applications: false,
    icons: [
      { src: "/icons/jarvis-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/jarvis-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/jarvis-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Abrir Jarvis", url: "/dashboard/jarvis" },
      { name: "Abrir CRM", url: "/dashboard" },
    ],
  };
}
