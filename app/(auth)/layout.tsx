import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, Check } from "lucide-react";
import { DotField } from "@/components/brand/dot-field";
import { NexoMark } from "@/components/brand/nexo-mark";
import { DesktopLoginControls } from "@/components/jarvis/desktop-login-controls";
import styles from "./auth.module.css";

const POINTS = [
  "Responde por tallas, colores y stock en WhatsApp.",
  "Cierra pedidos y envía tu enlace de pago o tus datos de transferencia.",
  "Te avisa cuando un cliente necesita a una persona.",
];

export default function AuthLayout({ children }: { children: ReactNode }) {
  return <div className={styles.shell}>
    <DesktopLoginControls />
    <div className={styles.field} aria-hidden="true"><DotField /></div>
    <nav className={styles.nav} aria-label="Navegación de acceso">
      <Link href="/" className={styles.brand}><NexoMark className={styles.mark} />NEXO</Link>
      <Link href="/" className={styles.back}><ArrowLeft size={14} /> Volver al inicio</Link>
    </nav>
    <main className={styles.main}>
      <section className={styles.story} aria-label="Lo que hace NEXO por tu tienda">
        <span className={styles.eyebrow}>TU TIENDA. TU AGENTE.</span>
        <h2>Tu tienda vende<br />con <span>NEXO.</span></h2>
        <ul className={styles.points}>{POINTS.map(point => <li key={point}><Check size={15} aria-hidden="true" />{point}</li>)}</ul>
        <div className={styles.hello} aria-hidden="true"><div className={styles.orb}><i /><i /></div><p>Hola, soy <strong>NEXO</strong>. Tu negocio sigue donde lo dejaste.</p></div>
      </section>
      <section className={styles.card} aria-label="Acceso a tu cuenta">{children}</section>
    </main>
    <footer className={styles.footer}>NEXO · Ventas por WhatsApp para tiendas online</footer>
  </div>;
}
