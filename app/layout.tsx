import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Inter } from "next/font/google";
import "./globals.css";
import { JarvisAppProvider } from "@/components/pwa/app-provider";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const title = "Zorax — Tu vendedor de IA para ecommerce por WhatsApp";
const description =
  "Zorax vende por WhatsApp con tu catálogo: responde por tallas y stock, cotiza envíos, registra pedidos y hace seguimiento de pagos desde tu CRM.";

export const metadata: Metadata = {
  // Absolute base for the shared-link image (app/opengraph-image.jpg), as in the sitemap.
  metadataBase: new URL((process.env.APP_URL?.trim() || "https://zoraxpilot.com").replace(/\/$/, "")),
  title,
  description,
  applicationName: "Zorax",
  appleWebApp: { capable: true, title: "Zorax", statusBarStyle: "black-translucent" },
  icons: {
    icon: [{ url: "/icons/zorax-mark.svg", type: "image/svg+xml" }, { url: "/icons/zorax-192.png", sizes: "192x192", type: "image/png" }],
    apple: "/icons/jarvis-apple-180.png",
  },
  openGraph: { type: "website", siteName: "Zorax", locale: "es_CO", title, description },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#09090b" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" data-scroll-behavior="smooth" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full"><JarvisAppProvider>{children}</JarvisAppProvider></body>
    </html>
  );
}
