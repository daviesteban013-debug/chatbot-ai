import Link from "next/link";
import {
  Bot,
  LayoutDashboard,
  LogOut,
  MessageCircleMore,
  Settings2,
  UsersRound,
} from "lucide-react";

const navigation = [
  { label: "Dashboard", href: "#resumen", icon: LayoutDashboard },
  { label: "Mi Asistente", href: "#asistente", icon: Bot },
  { label: "CRM", href: "#crm", icon: UsersRound },
];

export function DashboardSidebar() {
  return (
    <aside className="sticky top-0 z-30 flex max-h-svh flex-col border-b border-slate-200 bg-slate-950 text-white lg:h-svh lg:w-64 lg:shrink-0 lg:border-b-0 lg:border-r lg:border-white/5">
      <div className="flex h-16 items-center justify-between px-5 lg:h-20">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-xl bg-yellow-400 text-slate-950 shadow-lg shadow-yellow-400/15">
            <Bot className="size-5" strokeWidth={2.4} />
          </span>
          <span className="font-semibold tracking-tight">Nexo</span>
        </Link>
        <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-300">
          Online
        </span>
      </div>

      <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:px-4 lg:py-4">
        {navigation.map(({ label, href, icon: Icon }, index) => (
          <a
            key={label}
            href={href}
            className={`flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
              index === 0
                ? "bg-white/10 font-medium text-white"
                : "text-slate-400 hover:bg-white/5 hover:text-white"
            }`}
          >
            <Icon className="size-4.5" />
            {label}
          </a>
        ))}
      </nav>

      <div className="mt-auto hidden p-4 lg:block">
        <div className="mb-3 rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="mb-3 flex items-center gap-2 text-xs font-medium text-slate-300">
            <MessageCircleMore className="size-4 text-yellow-300" />
            Plan Pro
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full w-2/3 rounded-full bg-yellow-400" />
          </div>
          <p className="mt-2 text-[11px] text-slate-500">1,284 de 2,000 mensajes</p>
        </div>
        <a
          href="#asistente"
          className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-400 transition hover:bg-white/5 hover:text-white"
        >
          <Settings2 className="size-4.5" /> Configuración
        </a>
        <Link
          href="/"
          className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-400 transition hover:bg-white/5 hover:text-white"
        >
          <LogOut className="size-4.5" /> Cerrar sesión
        </Link>
      </div>
    </aside>
  );
}
