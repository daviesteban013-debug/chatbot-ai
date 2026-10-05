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
  title: "Nexo — Tu asistente de ventas con IA",
  description:
    "Automatiza conversaciones, citas y ventas por WhatsApp con un asistente de inteligencia artificial.",
  applicationName: "Jarvis",
  appleWebApp: { capable: true, title: "Jarvis", statusBarStyle: "black-translucent" },
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
