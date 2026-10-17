"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { NexoOrb } from "@/components/jarvis/nexo-orb";
import styles from "../auth.module.css";

const LINES = ["Creando tu tienda…", "Despertando a tu agente…"];

/**
 * Covers the screen from the moment the account exists until the welcome portal takes over,
 * so the portal's dark opening follows the click with no flash of anything else in between.
 * Rendered on <body>: the sign-up card animates with a transform that would trap a fixed layer.
 */
export function LaunchCurtain() {
  const [line, setLine] = useState(0);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const show = setTimeout(() => setMounted(true), 0);
    const next = setTimeout(() => setLine(1), 1000);
    return () => { clearTimeout(show); clearTimeout(next); };
  }, []);
  if (!mounted) return null;
  return createPortal(<div className={styles.launch} role="status" aria-live="polite">
    <div className={styles.launchOrb}><NexoOrb state="thinking" look={{ x: 0, y: 0 }} pulseKey={line} errorKey={null} /></div>
    <p key={line} className={styles.launchText}>{LINES[line]}</p>
  </div>, document.body);
}
