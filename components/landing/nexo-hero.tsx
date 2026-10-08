"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useState } from "react";
import { ArrowDown, ArrowRight, AudioLines, Check, MessageCircle, Package, Users } from "lucide-react";
import styles from "./nexo-hero.module.css";
import { DesktopDownloadLink } from "@/components/desktop/download-link";

const LiquidAvatar = dynamic(() => import("@/components/jarvis/liquid-avatar").then(module => module.JarvisLiquidAvatar), {
  ssr: false,
  loading: () => <div className={styles.loadingOrb} aria-hidden="true"><i /><i /></div>,
});
const prompts = [
  { label: "Mi negocio", icon: AudioLines, question: "NEXO, ¿cómo va mi negocio?", detail: "Tu CRM, en una conversación." },
  { label: "Mis clientes", icon: Users, question: "NEXO, busca a mi cliente.", detail: "Menos buscar. Más conocer a tus clientes." },
  { label: "Mis pedidos", icon: Package, question: "NEXO, ¿qué pedidos están pendientes?", detail: "Lo que necesitas saber, sin perderte entre pantallas." },
];

export function NexoHero() {
  const [selected, setSelected] = useState(0);
  const prompt = prompts[selected];
  return <section aria-labelledby="hero-title" className={styles.hero}>
    <div className={styles.glow} aria-hidden="true" />
    <div className={styles.layout}>
      <div className={styles.copy}>
        <p className={styles.eyebrow}><span /> TU NEGOCIO. TU AGENTE.</p>
        <h1 id="hero-title">Todo empieza<br />con <span>NEXO.</span></h1>
        <p className={styles.description}>Una voz. Todo tu negocio.<br /><span>Conoce a tu agente de IA: habla con él, consulta tu CRM y encuentra tu siguiente paso.</span></p>
        <div className={styles.actions}>
          <Link href="/signup" className="landing-primary">Conoce a NEXO <ArrowRight size={17} /></Link>
          <DesktopDownloadLink />
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
