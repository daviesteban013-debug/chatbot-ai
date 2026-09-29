import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Inter } from "next/font/google";
import { AppShell } from "@/components/layout/app-shell";
import { business } from "@/lib/mock-data";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: `Panel del Dueño — ${business.name}`,
  description:
    "Gestiona tu asistente virtual de IA para WhatsApp: reservas, pedidos, clientes y suscripción, todo en un solo lugar.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
