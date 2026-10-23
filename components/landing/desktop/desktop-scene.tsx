"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, MotionConfig, motion, useInView, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { ChevronUp, Folder, Globe, Minus, PackageCheck, Search, Square, Volume2, Wifi, X } from "lucide-react";
import { NexoMark } from "@/components/brand/nexo-mark";
import styles from "./desktop-scene.module.css";

const TOASTS = [
  { title: "Laura M. pide un asesor", body: "«¿Me ayudas con el cambio de talla?»", action: "Abrir chat" },
  { title: "Pedido #024 por aprobar", body: "1 × Chaqueta bomber · M — $149.000", action: "Revisar pedido" },
  { title: "Pago recibido", body: "Andrés R. pagó $189.000 por Nequi", action: "Ver pedido" },
];
/** Who waits after each alert. The badge adds customers asking for a person and orders to approve; a payment adds nobody. */
const QUEUE = [{ handoffs: 2, orders: 1 }, { handoffs: 2, orders: 2 }, { handoffs: 2, orders: 2 }];

const ROWS = [
  { initials: "LM", name: "Laura M.", last: "¿La tienen en talla M?", tag: "Pide asesor", tone: styles.handoff, on: true },
  { initials: "AR", name: "Andrés R.", last: "Ya hice el pago por Nequi", tag: "Pago", tone: styles.paid },
  { initials: "CP", name: "Camila P.", last: "Quiero 12 unidades al por mayor", tag: "Pedido", tone: styles.order },
  { initials: "SG", name: "Sofía G.", last: "Gracias, me llegó perfecto", tag: "Atendido", tone: styles.done },
  { initials: "JT", name: "Julián T.", last: "¿Hacen envíos a Cali?", tag: "Zorax", tone: styles.done },
  { initials: "VR", name: "Valentina R.", last: "¿Tienen el bolso en negro?", tag: "Zorax", tone: styles.done },
];

function StartGlyph() {
  return <svg viewBox="0 0 16 16"><path d="M1.5 1.5h6v6h-6zM8.5 1.5h6v6h-6zM1.5 8.5h6v6h-6zM8.5 8.5h6v6h-6z" fill="currentColor" /></svg>;
}

/**
 * Zorax for desktop, shown working: the CRM window, the floating agent and Windows-style alerts
 * that keep arriving while the taskbar badge counts who is waiting. It tilts up into place as it
 * scrolls in and only cycles while on screen. Decorative: the copy around it says the same.
 */
export function DesktopScene() {
  const stageRef = useRef<HTMLDivElement>(null);
  const inView = useInView(stageRef, { margin: "-15% 0px -15% 0px" });
  const reduced = useReducedMotion();
  const [step, setStep] = useState(0);
  const { scrollYProgress } = useScroll({ target: stageRef, offset: ["start end", "start 0.3"] });
  const rotateX = useTransform(scrollYProgress, [0, 1], [24, 0]);
  const scale = useTransform(scrollYProgress, [0, 1], [0.88, 1]);
  const y = useTransform(scrollYProgress, [0, 1], [48, 0]);

  useEffect(() => {
    if (!inView || (reduced && step > 0)) return;
    const timer = window.setTimeout(() => setStep(current => current + 1), step === 0 ? 700 : 3400);
    return () => window.clearTimeout(timer);
  }, [inView, reduced, step]);

  const index = (step - 1) % TOASTS.length;
  const toast = step > 0 ? TOASTS[index] : null;
  const queue = step > 0 ? QUEUE[index] : { handoffs: 1, orders: 1 };
  const waiting = queue.handoffs + queue.orders;

  return (
    <MotionConfig reducedMotion="user">
      <div ref={stageRef} className={styles.stage}>
        <div aria-hidden="true" className={styles.floor} />
        <motion.div aria-hidden="true" className={styles.screen} style={{ rotateX, scale, y }}>
          <div className={styles.desk}>
            <div className={styles.wallpaper} />

            <div className={styles.window}>
              <div className={styles.titlebar}>
                <span className={styles.brand}><NexoMark />Zorax</span>
                <span className={styles.controls}><Minus /><Square /><X /></span>
              </div>
              <div className={styles.body}>
                <div className={styles.rail}><i data-on="" /><i /><i /><i /><i /></div>
                <div className={styles.list}>
                  <div className={styles.listHead}><strong>Conversaciones</strong><span>Hoy</span></div>
                  <div className={styles.chips}><span>Todas</span><span data-on="">Esperan asesor · {queue.handoffs}</span><span>Pedidos · {queue.orders}</span></div>
                  {ROWS.map(row => (
                    <div key={row.name} className={styles.row} data-on={row.on ? "" : undefined}>
                      <span className={styles.avatar}>{row.initials}</span>
                      <span><b>{row.name}</b><small>{row.last}</small></span>
                      <em className={row.tone}>{row.tag}</em>
                    </div>
                  ))}
                </div>
                <div className={styles.chat}>
                  <div className={styles.chatHead}><span className={styles.avatar}>LM</span><span><b>Laura M.</b><small>Pidió hablar con una persona</small></span></div>
                  <div className={styles.messages}>
                    <p className={`${styles.bubble} ${styles.in}`}>Hola, vi la chaqueta bomber negra en su Instagram. ¿La tienen en talla M?</p>
                    <p className={`${styles.bubble} ${styles.out}`}>¡Sí! Nos quedan 3 en talla M. ¿Te la separo y te paso el link de pago?</p>
                    <div className={styles.orderCard}>
                      <div><small>Pedido #024</small><strong>$149.000</strong></div>
                      <div><small>1 × Chaqueta bomber · M</small><small>Por aprobar</small></div>
                      <p><PackageCheck className="size-[1em]" />Zorax lo dejó listo para pagar</p>
                    </div>
                    <p className={`${styles.bubble} ${styles.in}`}>Sí, pero antes quiero saber si puedo cambiarla.</p>
                    <p className={`${styles.bubble} ${styles.in} ${styles.typing}`}><i /><i /><i /></p>
                  </div>
                  <div className={styles.composer}><span>Escribe un mensaje…</span><i /></div>
                </div>
              </div>
            </div>

            <div className={styles.agent}>
              <div className={styles.orb}><i /><i /></div>
              <span className={styles.agentLabel}>Hablar con Zorax</span>
            </div>

            <div className={styles.toasts}>
              <AnimatePresence mode="wait">
                {toast && (
                  <motion.div
                    key={step}
                    className={styles.toast}
                    initial={{ opacity: 0, x: 36, scale: 0.98 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, x: 36 }}
                    transition={{ type: "spring", damping: 26, stiffness: 260 }}
                  >
                    <NexoMark />
                    <div>
                      <div className={styles.toastMeta}><span>Zorax</span><span>ahora</span></div>
                      <b>{toast.title}</b>
                      <p>{toast.body}</p>
                      <span className={styles.toastAction}>{toast.action}</span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className={styles.taskbar}>
              <span className={styles.app}><StartGlyph /></span>
              <span className={styles.app}><Search /></span>
              <span className={styles.app}><Globe /></span>
              <span className={styles.app}><Folder /></span>
              <span className={`${styles.app} ${styles.zorax}`}>
                <NexoMark />
                <span key={waiting} className={styles.badge}>{waiting}</span>
              </span>
              <span className={styles.tray}>
                <ChevronUp />
                <span className={styles.trayMark} data-alert=""><NexoMark /></span>
                <Wifi />
                <Volume2 />
                <span className={styles.clock}>7:42 p. m.<br />23/10/2026</span>
              </span>
            </div>
          </div>
        </motion.div>
        <p className={styles.caption}>Vista ilustrativa de Zorax para Windows. Los avisos y el contador son los de la app.</p>
      </div>
    </MotionConfig>
  );
}
