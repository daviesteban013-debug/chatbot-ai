import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Inter } from "next/font/google";
import "./globals.css";
import { JarvisAppProvider } from "@/components/pwa/app-provider";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "NEXO — Una voz. Todo tu negocio.",
  description:
    "Conoce a NEXO, tu agente de IA. Habla con él, consulta tu CRM y conecta con tus clientes por WhatsApp.",
  applicationName: "NEXO",
  appleWebApp: { capable: true, title: "NEXO", statusBarStyle: "black-translucent" },
  icons: { icon: "/icons/jarvis-192.png", apple: "/icons/jarvis-apple-180.png" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#09090b" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" data-scroll-behavior="smooth" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full"><JarvisAppProvider>{children}</JarvisAppProvider></body>
    </html>
  );
}
