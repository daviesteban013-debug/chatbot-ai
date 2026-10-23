import type { Metadata } from "next";
import { DotField } from "@/components/brand/dot-field";
import { DesktopDownloadSection } from "@/components/landing/desktop-download";
import { InstallGuide } from "@/components/landing/desktop/install-guide";
import { Faq } from "@/components/landing/faq";
import { LandingFooter } from "@/components/landing/footer";
import { LandingNavbar } from "@/components/landing/navbar";

export const metadata: Metadata = {
  title: "Descarga Zorax para Windows y Mac",
  description: "La app de escritorio de Zorax te avisa con el navegador cerrado, muestra en el ícono quién te espera y se abre al encender el computador.",
  alternates: { canonical: "/descargar" },
};

const questions = [
  ["¿Necesito la app para usar Zorax?", "No. Zorax funciona completo desde el navegador. La app suma lo que una pestaña no puede: avisos con el navegador cerrado, el contador en el ícono, el arranque con el computador y el atajo Alt + Shift + N."],
  ["¿Qué pasa si cierro la ventana?", "Zorax sigue en la bandeja, junto al reloj, y te sigue avisando. Para salir del todo, usa «Salir» en su ícono."],
  ["¿Puedo evitar que se abra al encender el computador?", "Sí. En el menú del ícono de la bandeja, desmarca «Abrir al encender el computador»."],
  ["¿Cómo se actualiza?", "Sola. Cuando hay una versión nueva, el aviso superior del CRM te deja descargarla y reiniciar para instalarla. Si no aparece, pulsa «Buscar actualización»."],
  ["¿Por qué mi computador me advierte al instalarla?", "Es una beta sin firma de código, así que Windows y macOS todavía no reconocen al editor. Los pasos de instalación de arriba muestran cómo abrirla."],
];

/** The desktop app's own page: the showcase as its hero, then installation, requirements and questions. */
export default function DownloadPage() {
  return (
    <div className="landing-root relative min-h-screen overflow-x-hidden">
      <div className="nexo-field" aria-hidden="true"><DotField /></div>
      <a href="#contenido" className="sr-only z-[60] rounded-lg bg-yellow-300 p-3 text-zinc-950 focus:fixed focus:left-4 focus:top-4 focus:not-sr-only">Saltar al contenido</a>
      <LandingNavbar base="/" />
      <main id="contenido" className="relative z-10">
        <DesktopDownloadSection heading="h1" more={false} />
        <InstallGuide />
        <Faq id="preguntas" eyebrow="La app de escritorio" title={<>Lo que preguntan<br />antes de instalarla.</>} copy="Respuestas cortas sobre la beta para Windows y Mac." items={questions} />
      </main>
      <LandingFooter base="/" />
    </div>
  );
}
