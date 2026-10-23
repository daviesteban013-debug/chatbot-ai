"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useState } from "react";
import { ArrowDown, ArrowRight, AudioLines, Check, MessageCircle, Package, Users } from "lucide-react";
import { BlurText, BlurWord } from "@/components/react-bits/blur-text";
import { RotatingText } from "@/components/react-bits/rotating-text";
import { TextType } from "@/components/react-bits/text-type";
import styles from "./nexo-hero.module.css";

const LiquidAvatar = dynamic(() => import("@/components/jarvis/liquid-avatar").then(module => module.JarvisLiquidAvatar), {
  ssr: false,
  loading: () => <div className={styles.loadingOrb} aria-hidden="true"><i /><i /></div>,
});
const prompts = [
  { label: "Mis ventas", icon: AudioLines, question: "Zorax, ¿cómo van las ventas de hoy?", detail: "Tu tienda y tu CRM, en una conversación." },
  { label: "Mis clientes", icon: Users, question: "Zorax, ¿qué compró antes este cliente?", detail: "Menos buscar. Más conocer a tus compradores." },
  { label: "Mis pedidos", icon: Package, question: "Zorax, ¿qué pedidos están pendientes de pago?", detail: "Lo que necesitas saber, sin perderte entre pantallas." },
];
/** Who the seller is for, in turns; the first one is what crawlers and the first paint show. */
const niches = ["ecommerce", "tiendas de ropa", "tiendas de tenis", "tiendas de tecnología", "marcas de cosmética", "ventas al por mayor"];

export function NexoHero() {
  const [selected, setSelected] = useState(0);
  const prompt = prompts[selected];
  return <section aria-labelledby="hero-title" className={styles.hero}>
    <div className={styles.glow} aria-hidden="true" />
    <div className={styles.layout}>
      <div className={styles.copy}>
        <p className={styles.eyebrow}><span /> TU TIENDA ONLINE. TU AGENTE.</p>
        <h1 id="hero-title"><BlurText text="Tu tienda vende" /><br /><BlurText text="por WhatsApp" start={3} /> <BlurWord index={5} className={styles.accent}><span className="rb-gradient-text">24/7.</span></BlurWord></h1>
        <p className={styles.description}>
          <span className={styles.lead}>Tu vendedor de IA para</span>
          <RotatingText texts={niches} label="ecommerce: tiendas de ropa, tenis, tecnología, cosmética y ventas al por mayor." className={styles.niche} />
          <span className={styles.detail}>Vende por WhatsApp con tu catálogo: responde por tallas y stock, cotiza el envío y deja cada pedido listo para pagar.</span>
        </p>
        <div className={styles.actions}>
          <Link href="/signup" className="landing-primary rb-glare">Empieza gratis <ArrowRight size={17} /></Link>
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
        <div className={styles.hello}><span className={styles.presence} /><span>Hola, soy <strong>Zorax.</strong></span><AudioLines size={18} /></div>
        <p className={styles.orbCaption}>Una nueva forma de estar al frente.</p>
      </div>
    </div>
    <div className={styles.preview}>
      <div className={styles.previewTitle}><MessageCircle size={17} /><span>Empieza por una pregunta</span><small>Ejemplos de consulta</small></div>
      <div className={styles.previewBody}>
        <div className={styles.promptText} aria-live="polite"><p><span className="sr-only">“{prompt.question}”</span><TextType key={selected} text={`“${prompt.question}”`} /></p><span>{prompt.detail}</span></div>
        <div className={styles.promptButtons} role="group" aria-label="Ejemplos para Zorax">{prompts.map((item, index) => <button key={item.label} type="button" aria-pressed={selected === index} onClick={() => setSelected(index)}><item.icon size={14} />{item.label}</button>)}</div>
      </div>
    </div>
  </section>;
}
