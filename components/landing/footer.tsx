"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Bot, X } from "lucide-react";

const notices = {
  terms: { title: "Términos · Información provisional", text: "Esta página presenta el producto y una propuesta ilustrativa de planes. No constituye una oferta contractual ni activa pagos. Los términos definitivos de contratación, renovación, cancelación y reembolso están pendientes de publicación y aceptación antes de contratar." },
  privacy: { title: "Privacidad · Información provisional", text: "La conversación de demostración se reproduce localmente con datos ficticios y no envía mensajes a WhatsApp. La política completa del servicio —responsable, finalidades, conservación y canales para ejercer tus derechos— está pendiente de publicación. No introduzcas datos personales o sensibles en la demo." },
};

export function LandingFooter() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [notice, setNotice] = useState<keyof typeof notices>("terms");
  function showNotice(kind: keyof typeof notices) { setNotice(kind); dialog.current?.showModal(); }
  return (
    <footer id="contacto" className="border-t border-white/10">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-12 sm:grid-cols-[2fr_1fr_1fr] sm:px-8">
        <div><Link href="/" className="inline-flex items-center gap-2.5 font-semibold tracking-tight"><span className="flex size-9 items-center justify-center rounded-xl bg-yellow-300 text-zinc-950"><Bot className="size-5" /></span>Nexo</Link><p className="mt-4 max-w-xs text-sm leading-7 text-zinc-500">Más conversaciones que avanzan.<br />Más negocios que crecen en Colombia.</p><p className="mt-4 text-[11px] text-zinc-600">Nexo es independiente de Meta y WhatsApp.</p></div>
        <div><h2 className="text-xs font-medium text-zinc-300">Producto</h2><ul className="mt-5 space-y-3 text-xs text-zinc-500">{[["Funciones", "#producto"], ["Demostración en vivo", "#demo"], ["Cómo funciona", "#como-funciona"], ["Precios", "#precios"], ["Preguntas frecuentes", "#faq"]].map(([label, href]) => <li key={href}><a href={href} className="transition hover:text-white">{label}</a></li>)}</ul></div>
        <div><h2 className="text-xs font-medium text-zinc-300">Tu siguiente paso</h2><ul className="mt-5 space-y-3 text-xs text-zinc-500"><li><Link href="/signup" className="text-yellow-300 hover:text-yellow-200">Empieza gratis</Link></li><li><Link href="/login" className="hover:text-white">Inicia sesión</Link></li><li><a href="#demo" className="hover:text-white">Ver demo</a></li></ul><div className="mt-6 flex gap-3 text-zinc-500"><span className="rounded-lg border border-white/10 px-2.5 py-1 text-[10px] uppercase tracking-wide">Instagram</span><span className="rounded-lg border border-white/10 px-2.5 py-1 text-[10px] uppercase tracking-wide">LinkedIn</span></div><p className="mt-2 text-[10px] text-zinc-600">Canales oficiales próximamente</p></div>
      </div>
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 border-t border-white/8 px-5 py-6 text-[11px] text-zinc-500 sm:px-8"><p>© {new Date().getFullYear()} Nexo</p><div className="flex gap-5"><button type="button" onClick={() => showNotice("terms")} className="hover:text-white">Términos</button><button type="button" onClick={() => showNotice("privacy")} className="hover:text-white">Privacidad</button><span>Colombia · ES</span></div></div>
      <dialog ref={dialog} aria-labelledby="legal-title" className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl border border-white/15 bg-zinc-900 p-6 text-white shadow-2xl backdrop:bg-black/75">
        <div className="flex items-start justify-between gap-4"><h2 id="legal-title" className="text-lg font-medium">{notices[notice].title}</h2><button type="button" onClick={() => dialog.current?.close()} aria-label="Cerrar información legal" className="shrink-0 rounded-md p-1 text-zinc-400 hover:text-white"><X className="size-5" /></button></div><p className="mt-5 text-sm leading-7 text-zinc-400">{notices[notice].text}</p>
      </dialog>
    </footer>
  );
}
