import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { NexoConstellation } from "@/components/landing/nexo-constellation";
import { DesktopLoginControls } from "@/components/jarvis/desktop-login-controls";
import styles from "./auth.module.css";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return <div className={styles.shell}>
    <DesktopLoginControls />
    <NexoConstellation />
    <nav className={styles.nav} aria-label="Navegación de acceso">
      <Link href="/" className={styles.brand}>Nexo<span>.ai</span></Link>
      <Link href="/" className={styles.back}><ArrowLeft size={14} /> Volver al inicio</Link>
    </nav>
    <main className={styles.main}>
      <section className={styles.story} aria-label="Tu agente NEXO">
        <span className={styles.eyebrow}>TU NEGOCIO. TU AGENTE.</span>
        <h2>Todo empieza<br />con <span>NEXO.</span></h2>
        <p>Habla, organiza y haz que las cosas pasen.<br />Tu siguiente paso empieza con una conversación.</p>
        <div className={styles.orbit} aria-hidden="true"><div className={styles.orb}><i /><i /></div><span className={styles.orbitLine} /></div>
        <div className={styles.caption}><span className={styles.dot} /> Una voz. Todo tu negocio. <ArrowUpRight size={16} /></div>
      </section>
      <section className={styles.card} aria-label="Acceso a tu cuenta">{children}</section>
    </main>
    <footer className={styles.footer}>Nexo.ai · Tu negocio, acompañado.</footer>
  </div>;
}
