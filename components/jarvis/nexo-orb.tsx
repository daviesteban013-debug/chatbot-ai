"use client";
import { useEffect, useRef, type CSSProperties } from "react";
import styles from "./nexo-orb.module.css";

export type OrbState = "off" | "idle" | "listening" | "thinking" | "speaking" | "error";

const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * NEXO's face. A single body with two eyes that blink at natural intervals, follow the
 * pointer, and change with what NEXO is doing: resting, listening, thinking, speaking.
 * Size comes from --orb-size on the container; color from --nexo-color.
 */
export function NexoOrb({ state, look, pulseKey, errorKey, className, title }: {
  state: OrbState;
  /** Where the eyes look, in pixels from center (from the pointer). */
  look?: { x: number; y: number };
  /** Change this value to send one ring outwards (a new alert, a new turn). */
  pulseKey?: string | number;
  /** A new error message makes NEXO flinch for a moment without staying red. */
  errorKey?: string | null;
  className?: string;
  title?: string;
}) {
  const root = useRef<HTMLSpanElement>(null);
  const eyes = useRef<HTMLSpanElement>(null);
  const ping = useRef<HTMLSpanElement>(null);
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);

  // Blinks: irregular, sometimes double, never while reduced motion is on.
  useEffect(() => {
    if (reduced() || state === "off") return;
    let timer: ReturnType<typeof setTimeout>;
    let live = true;
    const close = (ms: number) => { eyes.current?.setAttribute("data-blink", "1"); setTimeout(() => eyes.current?.removeAttribute("data-blink"), ms); };
    const schedule = () => {
      const wait = (stateRef.current === "speaking" ? 4200 : 2600) + Math.random() * 3800;
      timer = setTimeout(() => {
        if (!live) return;
        close(120);
        if (Math.random() < 0.14) setTimeout(() => live && close(110), 260);
        schedule();
      }, wait);
    };
    schedule();
    return () => { live = false; clearTimeout(timer); };
  }, [state]);

  // Speaking: each eye breathes with its own rhythm, like a voice level.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    if (state !== "speaking" || reduced()) { el.style.removeProperty("--eye-l"); el.style.removeProperty("--eye-r"); return; }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = (now - start) / 1000;
      const l = 0.45 + 0.55 * Math.abs(Math.sin(t * 7.3) * 0.6 + Math.sin(t * 11.1) * 0.4);
      const r = 0.45 + 0.55 * Math.abs(Math.sin(t * 6.1 + 1.2) * 0.6 + Math.sin(t * 12.7) * 0.4);
      el.style.setProperty("--eye-l", l.toFixed(3));
      el.style.setProperty("--eye-r", r.toFixed(3));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); el.style.removeProperty("--eye-l"); el.style.removeProperty("--eye-r"); };
  }, [state]);

  // One ring outwards when something new arrives. Skips the first render.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const el = ping.current;
    if (!el || reduced()) return;
    el.classList.remove(styles.pingOn);
    void el.offsetWidth;
    el.classList.add(styles.pingOn);
  }, [pulseKey]);

  useEffect(() => {
    const el = root.current;
    if (!el || !errorKey) return;
    el.classList.remove(styles.flinch);
    void el.offsetWidth;
    el.classList.add(styles.flinch);
    const timer = setTimeout(() => el.classList.remove(styles.flinch), 2400);
    return () => clearTimeout(timer);
  }, [errorKey]);

  return <span ref={root} className={`${styles.orb} ${className ?? ""}`} data-state={state} title={title} aria-hidden="true"
    style={{ "--look-x": `${look?.x ?? 0}px`, "--look-y": `${look?.y ?? 0}px` } as CSSProperties}>
    <span className={styles.ring} />
    <span className={styles.halo} />
    <span ref={ping} className={styles.ping} />
    <span className={styles.body}>
      <span ref={eyes} className={styles.eyes}><i /><i /></span>
      <span className={styles.gloss} />
    </span>
  </span>;
}
