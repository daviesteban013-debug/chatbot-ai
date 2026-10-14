"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useState } from "react";
import { ArrowDown, ArrowRight, AudioLines, Check, MessageCircle, Package, Users } from "lucide-react";
import styles from "./nexo-hero.module.css";
import { DesktopDownloadLink } from "@/components/pwa/desktop-download-link";

const LiquidAvatar = dynamic(() => import("@/components/jarvis/liquid-avatar").then(module => module.JarvisLiquidAvatar), {
  ssr: false,
  loading: () => <div className={styles.loadingOrb} aria-hidden="true"><i /><i /></div>,
});
const prompts = [
  { label: "Mis ventas", icon: AudioLines, question: "NEXO, ¿cómo van las ventas de hoy?", detail: "Tu tienda y tu CRM, en una conversación." },
  { label: "Mis clientes", icon: Users, question: "NEXO, ¿qué compró antes este cliente?", detail: "Menos buscar. Más conocer a tus compradores." },
  { label: "Mis pedidos", icon: Package, question: "NEXO, ¿qué pedidos están pendientes de pago?", detail: "Lo que necesitas saber, sin perderte entre pantallas." },
];

export function NexoHero() {
  const [selected, setSelected] = useState(0);
  const prompt = prompts[selected];
  return <section aria-labelledby="hero-title" className={styles.hero}>
    <div className={styles.glow} aria-hidden="true" />
    <div className={styles.layout}>
      <div className={styles.copy}>
        <p className={styles.eyebrow}><span /> TU TIENDA ONLINE. TU AGENTE.</p>
        <h1 id="hero-title">Todo empieza<br />con <span>NEXO.</span></h1>
        <p className={styles.description}>Tu vendedor de IA para ecommerce.<br /><span>Vende por WhatsApp con tu catálogo: responde por tallas y stock, cotiza el envío y deja cada pedido listo para pagar.</span></p>
        <div className={styles.actions}>
          <Link href="/signup" className="landing-primary">Conoce a NEXO <ArrowRight size={17} /></Link>
          <DesktopDownloadLink />
          <DesktopDownloadLink platform="mac" />
          <a href="#demo" className={styles.secondary}>Explora la demo <ArrowDown size={15} /></a>
        </div>
        <p className={styles.note}><Check size={13} /> Empieza gratis <span>·</span> Sin tarjeta</p>
      </div>
      <div className={styles.stage}>
        <div className={styles.orbit} aria-hidden="true"><span /></div>
        <div className={styles.orbitTwo} aria-hidden="true" />
        <span className={styles.coordinate} aria-hidden="true">N / 01 · TU CENTRO DE MANDO</span>
        <div className={styles.avatar}><LiquidAvatar powered state="IDLE" accent="#facc15" onActivate={() => {}} /></div>
        <span className={styles.sparkOne} aria-hidden="true">+</span><span className={styles.sparkTwo} aria-hidden="true">+</span>
        <div className={styles.hello}><span className={styles.presence} /><span>Hola, soy <strong>NEXO.</strong></span><AudioLines size={18} /></div>
        <p className={styles.orbCaption}>Una nueva forma de estar al frente.</p>
      </div>
    </div>
    <div className={styles.preview}>
      <div className={styles.previewTitle}><MessageCircle size={17} /><span>Empieza por una pregunta</span><small>Ejemplos de consulta</small></div>
      <div className={styles.previewBody}>
        <div className={styles.promptText} aria-live="polite"><p key={selected}>“{prompt.question}”</p><span>{prompt.detail}</span></div>
        <div className={styles.promptButtons} role="group" aria-label="Ejemplos para NEXO">{prompts.map((item, index) => <button key={item.label} type="button" aria-pressed={selected === index} onClick={() => setSelected(index)}><item.icon size={14} />{item.label}</button>)}</div>
      </div>
    </div>
  </section>;
}
