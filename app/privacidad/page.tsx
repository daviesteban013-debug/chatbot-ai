import type { Metadata } from "next";
import Link from "next/link";
import { NexoMark } from "@/components/brand/nexo-mark";

export const metadata: Metadata = {
  title: "Política de privacidad · Zorax",
  description: "Cómo Zorax trata los datos de los negocios que lo usan y de sus clientes en WhatsApp.",
};

const CONTACT = "daviesteban013@gmail.com";
const UPDATED = "15 de octubre de 2026";

const sections: { id: string; title: string; body: React.ReactNode }[] = [
  { id: "quienes", title: "1. Quiénes somos", body: <>
    <p>Zorax es un servicio en línea para tiendas que venden por WhatsApp: un agente que responde a sus clientes, prepara pedidos y un CRM para el equipo del negocio. Esta política explica qué datos tratamos, para qué y cómo puedes ejercer tus derechos, conforme a la Ley 1581 de 2012 de Colombia y sus normas reglamentarias.</p>
    <p>Contacto para privacidad: <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.</p>
  </> },
  { id: "roles", title: "2. Dos tipos de datos y dos roles", body: <>
    <p><strong>Datos de los negocios que usan Zorax</strong> (nombre, correo, nombre del negocio, configuración y pagos del plan): Zorax es el responsable de su tratamiento.</p>
    <p><strong>Datos de los clientes de cada negocio</strong> (número de WhatsApp, nombre, mensajes, pedidos y direcciones de entrega): el responsable es el negocio que contrata Zorax. Zorax los trata como encargado, por cuenta de ese negocio y solo para prestarle el servicio.</p>
  </> },
  { id: "datos", title: "3. Qué datos tratamos", body: <ul>
    <li>Cuenta: correo, nombre del negocio, rol en el equipo y registros de acceso.</li>
    <li>Conversaciones de WhatsApp que los clientes envían al número del negocio y las respuestas del agente.</li>
    <li>Pedidos, productos, precios, existencias y datos de entrega que el negocio registra o que el cliente comparte para comprar.</li>
    <li>Archivos y notas de voz que el equipo comparte con Zorax para procesarlos.</li>
    <li>Pagos del plan: los procesa Mercado Pago; Zorax no almacena números de tarjeta.</li>
  </ul> },
  { id: "finalidades", title: "4. Para qué los usamos", body: <ul>
    <li>Responder a los clientes del negocio, cotizar, preparar y registrar pedidos y avisar al equipo cuando se necesita una persona.</li>
    <li>Mostrar al negocio su CRM, resultados y actividad.</li>
    <li>Cobrar el plan contratado, dar soporte y mantener la seguridad del servicio.</li>
  </ul> },
  { id: "proveedores", title: "5. Con quién los compartimos", body: <>
    <p>Solo con proveedores necesarios para prestar el servicio, que actúan bajo nuestras instrucciones: Meta (WhatsApp Business Platform) para enviar y recibir mensajes; Supabase para la base de datos; Vercel para el alojamiento; proveedores de modelos de lenguaje y de voz para generar respuestas y transcribir audio; y Mercado Pago para los pagos del plan. Algunos operan fuera de Colombia, con garantías adecuadas de protección. No vendemos datos personales.</p>
  </> },
  { id: "conservacion", title: "6. Cuánto tiempo los conservamos", body: <p>Mientras el negocio tenga su cuenta activa y luego el tiempo necesario para cumplir obligaciones legales o resolver reclamaciones. Al cerrar la cuenta, los datos se eliminan o anonimizan en un plazo razonable, salvo los que la ley obligue a conservar.</p> },
  { id: "derechos", title: "7. Tus derechos", body: <>
    <p>Puedes conocer, actualizar, rectificar y solicitar la supresión de tus datos, revocar la autorización y presentar quejas ante la Superintendencia de Industria y Comercio. Escríbenos a <a href={`mailto:${CONTACT}`}>{CONTACT}</a>; respondemos consultas en máximo 10 días hábiles y reclamos en máximo 15 días hábiles.</p>
    <p>Si eres cliente de una tienda que usa Zorax, también puedes dirigirte directamente a esa tienda, que es la responsable de tus datos.</p>
  </> },
  { id: "eliminar-datos", title: "8. Cómo eliminar tus datos", body: <>
    <p>Para eliminar tus datos, escribe a <a href={`mailto:${CONTACT}`}>{CONTACT}</a> con el asunto «Eliminar mis datos», indicando tu correo de cuenta o tu número de WhatsApp. Confirmaremos la eliminación por el mismo medio. Si eres cliente de una tienda, también puedes escribir «no quiero recibir más mensajes» en el chat para dejar de recibir seguimientos.</p>
  </> },
  { id: "seguridad", title: "9. Seguridad", body: <p>Usamos conexiones cifradas, control de acceso por negocio y rol, y cifrado de las credenciales de WhatsApp. Ningún sistema es infalible; si ocurre un incidente que te afecte, te avisaremos según la ley.</p> },
  { id: "cambios", title: "10. Cambios", body: <p>Si cambiamos esta política, publicaremos la nueva versión en esta página con su fecha de actualización.</p> },
];

/** Public privacy policy (also used as the Privacy Policy URL of the Meta app). */
export default function PrivacyPage() {
  return <div className="min-h-svh bg-[#09090b] text-zinc-200">
    <header className="mx-auto flex max-w-3xl items-center justify-between px-5 py-6">
      <Link href="/" className="flex items-center gap-2.5 text-sm font-bold tracking-[.06em] text-white"><NexoMark className="size-7" />Zorax</Link>
      <Link href="/" className="text-xs text-zinc-400 hover:text-white">Volver al inicio</Link>
    </header>
    <main className="mx-auto max-w-3xl px-5 pb-20">
      <h1 className="mt-6 text-3xl font-semibold tracking-tight text-white">Política de privacidad</h1>
      <p className="mt-2 text-sm text-zinc-500">Última actualización: {UPDATED}</p>
      <nav aria-label="Contenido" className="mt-8 flex flex-wrap gap-2 text-xs">
        {sections.map(section => <a key={section.id} href={`#${section.id}`} className="rounded-md border border-white/10 px-2.5 py-1 text-zinc-400 hover:text-white">{section.title.replace(/^\d+\. /, "")}</a>)}
      </nav>
      {sections.map(section => <section key={section.id} id={section.id} className="mt-10 scroll-mt-6 space-y-3 text-[15px] leading-7 text-zinc-300 [&_a]:text-yellow-300 [&_a]:underline [&_a]:underline-offset-4 [&_li]:ml-5 [&_li]:list-disc [&_strong]:text-white [&_ul]:space-y-1.5">
        <h2 className="text-lg font-semibold text-white">{section.title}</h2>
        {section.body}
      </section>)}
    </main>
  </div>;
}
