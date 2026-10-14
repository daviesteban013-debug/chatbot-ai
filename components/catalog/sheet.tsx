"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

/** Side panel on desktop, full screen on phones. Escape or the backdrop closes it. */
export function Sheet({ title, onClose, children, footer, wide }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = previous; window.removeEventListener("keydown", onKey); };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40 backdrop-blur-[2px]" role="dialog" aria-modal="true" aria-label={title}
      onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <section className={`flex h-full w-full flex-col bg-white shadow-2xl ${wide ? "max-w-5xl" : "max-w-2xl"}`}>
        <header className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-950">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="size-5" /></button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer && <footer className="border-t border-slate-200 bg-slate-50/80 px-5 py-4">{footer}</footer>}
      </section>
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-700">{label}</span>
      <div className="mt-1.5">{children}</div>
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}
