import Link from "next/link";
import { Bot, LogIn } from "lucide-react";

export function LandingNavbar() {
  return (
    <header className="fixed inset-x-0 top-5 z-50 px-4">
      <nav className="mx-auto flex w-full max-w-3xl items-center justify-between rounded-2xl border border-white/10 bg-zinc-950/70 px-3 py-2 shadow-2xl shadow-black/30 backdrop-blur-xl sm:px-4">
        <Link href="/" className="flex items-center gap-2.5" aria-label="Nexo, inicio">
          <span className="flex size-9 items-center justify-center rounded-xl bg-yellow-400 text-zinc-950 shadow-lg shadow-yellow-400/20">
            <Bot className="size-5" strokeWidth={2.4} />
          </span>
          <span className="text-sm font-semibold tracking-tight text-white">Nexo</span>
        </Link>

        <div className="hidden items-center gap-7 text-xs text-zinc-400 sm:flex">
          <a className="transition hover:text-white" href="#experiencia">
            Producto
          </a>
          <a className="transition hover:text-white" href="#como-funciona">
            Cómo funciona
          </a>
        </div>

        <Link
          href="/dashboard"
          className="flex items-center gap-2 rounded-xl border border-yellow-400/25 bg-yellow-400/10 px-3.5 py-2 text-xs font-medium text-yellow-300 transition hover:border-yellow-300/50 hover:bg-yellow-400/15"
        >
          <LogIn className="size-3.5" />
          Inicia sesión
        </Link>
      </nav>
    </header>
  );
}
