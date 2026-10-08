"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Bot, Download, Menu, X } from "lucide-react";

const links = [
  ["Producto", "#producto"],
  ["Demo", "#demo"],
  ["Cómo funciona", "#como-funciona"],
  ["Precios", "#precios"],
  ["FAQ", "#faq"],
];

export function LandingNavbar() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header onKeyDown={(event) => { if (event.key === "Escape") { setOpen(false); document.getElementById("landing-menu-toggle")?.focus(); } }} className="fixed inset-x-0 top-4 z-50 px-4">
      <nav aria-label="Navegación principal" className={`mx-auto flex w-full max-w-6xl items-center justify-between rounded-2xl border px-3 py-3 backdrop-blur-xl transition duration-300 sm:px-5 ${scrolled || open ? "border-white/15 bg-zinc-950/95 shadow-2xl shadow-black/40" : "border-white/8 bg-zinc-950/60"}`}>
        <Link href="/" className="flex items-center gap-2.5" aria-label="Nexo, inicio">
          <span className="flex size-9 items-center justify-center rounded-xl bg-yellow-400 text-zinc-950 shadow-lg shadow-yellow-400/20">
            <Bot className="size-5" strokeWidth={2.4} />
          </span>
          <span className="text-lg font-semibold tracking-tight text-white">Nexo<span className="text-yellow-300">.ai</span></span>
        </Link>

        <div className="hidden items-center gap-6 text-xs text-zinc-400 lg:flex">
          {links.map(([label, href]) => <a key={href} className="transition hover:text-white" href={href}>{label}</a>)}
        </div>

        <div className="flex items-center gap-2 sm:gap-4">
          <a href="#descargar" aria-label="Descargar NEXO para Windows o Mac" className="inline-flex items-center gap-2 rounded-xl border border-yellow-300/25 bg-yellow-300/10 px-3 py-2.5 text-xs font-medium text-yellow-200 transition hover:bg-yellow-300/20"><Download className="size-4" /><span className="hidden sm:inline">Descargar</span></a>
          <Link href="/login" className="hidden text-xs font-medium text-zinc-300 transition hover:text-white sm:block">Inicia sesión</Link>
          <Link href="/signup" className="rounded-xl bg-yellow-300 px-3.5 py-2.5 text-xs font-semibold text-zinc-950 transition hover:bg-yellow-200">Empieza gratis</Link>
          <button id="landing-menu-toggle" type="button" aria-label={open ? "Cerrar menú" : "Abrir menú"} aria-expanded={open} aria-controls="landing-mobile-menu" onClick={() => setOpen(!open)} className="rounded-lg p-2 text-zinc-300 lg:hidden">{open ? <X className="size-5" /> : <Menu className="size-5" />}</button>
        </div>
      </nav>
      <div id="landing-mobile-menu" hidden={!open} className="mx-auto mt-2 max-w-6xl rounded-2xl border border-white/10 bg-zinc-950/95 p-3 shadow-2xl backdrop-blur-xl lg:hidden!">
        {links.map(([label, href]) => <a key={href} href={href} onClick={() => setOpen(false)} className="block rounded-lg px-4 py-3 text-sm text-zinc-300 hover:bg-white/5">{label}</a>)}
        <Link href="/login" onClick={() => setOpen(false)} className="mt-1 block rounded-lg border-t border-white/10 px-4 py-3 text-sm text-yellow-300">Inicia sesión</Link>
      </div>
    </header>
  );
}
