"use client";

import { useEffect, useRef, type RefObject } from "react";

export type FieldPulse = "speaking" | "listening" | "processing" | null;

const RADIUS = 170; // cursor reach, px
const PUSH = 7; // how far dots move aside, px
const RIPPLE_SPEED = 380; // px per second
const RIPPLE_WIDTH = 48;
const RIPPLE_LIFE = 2.6; // seconds
const MAX_RIPPLES = 12;
/** Seconds between waves and their strength while NEXO talks, listens or thinks. */
const PULSES: Record<Exclude<FieldPulse, null>, [number, number]> = { speaking: [0.6, 1], listening: [1.5, 0.55], processing: [1.1, 0.4] };

/**
 * An interactive field of dots: they light up in the brand color and move aside near the
 * cursor, a click or tap sends a wave, and NEXO's voice sends waves from its orb.
 * Canvas 2D only; it pauses in hidden tabs and stays still with reduced motion.
 */
export function DotField({ accent = "#facc15", gap = 26, className, pulse = null, originRef, burstKey }: {
  accent?: string; gap?: number; className?: string; pulse?: FieldPulse; originRef?: RefObject<HTMLElement | null>;
  /** Change this value to send three strong waves from the origin (or the center): a moment worth marking. */
  burstKey?: string | number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pulseRef = useRef<FieldPulse>(pulse);
  const accentRef = useRef(accent);
  const wakeRef = useRef<() => void>(() => {});
  const burstRef = useRef<() => void>(() => {});
  const lastBurst = useRef(burstKey);
  useEffect(() => { pulseRef.current = pulse; wakeRef.current(); }, [pulse]);
  useEffect(() => { accentRef.current = accent; wakeRef.current(); }, [accent]);
  useEffect(() => { if (burstKey !== lastBurst.current) { lastBurst.current = burstKey; burstRef.current(); } }, [burstKey]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    let width = 0, height = 0, dpr = 1, rect = canvas.getBoundingClientRect();
    let xs = new Float32Array(0), ys = new Float32Array(0), lit = new Float32Array(0);
    let frame: number | null = null, previous = 0, lastDraw = 0, time = 0, lastPulse = -10;
    const pointer = { x: 0, y: 0, tx: 0, ty: 0, on: 0, target: 0 };
    const ripples: { x: number; y: number; at: number; power: number }[] = [];

    function layout() {
      rect = canvas!.getBoundingClientRect();
      width = rect.width; height = rect.height; dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas!.width = Math.max(1, Math.round(width * dpr)); canvas!.height = Math.max(1, Math.round(height * dpr));
      const cols = Math.ceil(width / gap) + 1, rows = Math.ceil(height / gap) + 1;
      const ox = (width - (cols - 1) * gap) / 2, oy = (height - (rows - 1) * gap) / 2;
      xs = new Float32Array(cols * rows); ys = new Float32Array(cols * rows); lit = new Float32Array(cols * rows * 3);
      for (let r = 0, i = 0; r < rows; r++) for (let c = 0; c < cols; c++, i++) { xs[i] = ox + c * gap; ys[i] = oy + r * gap; }
    }

    function draw(still: boolean) {
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx!.clearRect(0, 0, width, height);
      ctx!.globalAlpha = 1;
      ctx!.fillStyle = "rgba(255,255,255,0.1)";
      ctx!.beginPath();
      let count = 0;
      for (let i = 0; i < xs.length; i++) {
        let x = xs[i], y = ys[i], energy = 0;
        if (!still) {
          // A slow diagonal swell so the field feels alive without input.
          const swell = 0.5 + 0.5 * Math.sin(time * 0.45 - (x + y * 1.3) * 0.005);
          energy += swell ** 8 * 0.1;
          const dx = x - pointer.x, dy = y - pointer.y, distance = Math.hypot(dx, dy) || 1;
          if (pointer.on > 0.01 && distance < RADIUS) {
            let reach = 1 - distance / RADIUS; reach = reach * reach * (3 - 2 * reach) * pointer.on;
            energy += reach; x += (dx / distance) * reach * PUSH; y += (dy / distance) * reach * PUSH;
          }
          for (const ripple of ripples) {
            const age = time - ripple.at, rx = xs[i] - ripple.x, ry = ys[i] - ripple.y, d = Math.hypot(rx, ry) || 1;
            const band = 1 - Math.abs(d - age * RIPPLE_SPEED) / RIPPLE_WIDTH;
            if (band <= 0) continue;
            const strength = band * (1 - age / RIPPLE_LIFE) * ripple.power;
            energy += strength * 0.85; x += (rx / d) * strength * 4; y += (ry / d) * strength * 4;
          }
        }
        if (energy < 0.035) { ctx!.moveTo(x + 1, y); ctx!.arc(x, y, 1, 0, Math.PI * 2); }
        else { lit[count * 3] = x; lit[count * 3 + 1] = y; lit[count * 3 + 2] = Math.min(energy, 1); count++; }
      }
      ctx!.fill();
      ctx!.fillStyle = accentRef.current;
      for (let n = 0; n < count; n++) {
        const energy = lit[n * 3 + 2];
        ctx!.globalAlpha = 0.12 + energy * 0.68;
        ctx!.beginPath();
        ctx!.arc(lit[n * 3], lit[n * 3 + 1], 1 + energy * 1.5, 0, Math.PI * 2);
        ctx!.fill();
      }
      ctx!.globalAlpha = 1;
    }

    function tick(timestamp: number) {
      frame = null;
      if (document.hidden || motion.matches) return;
      const busy = pointer.on > 0.01 || ripples.length > 0 || pulseRef.current !== null;
      // Idle: about 24 frames per second for the slow swell; full rate while interacting.
      if (!busy && timestamp - lastDraw < 40) { frame = requestAnimationFrame(tick); return; }
      time += previous ? Math.min((timestamp - previous) / 1000, 0.05) : 0;
      previous = timestamp; lastDraw = timestamp;
      pointer.x += (pointer.tx - pointer.x) * 0.2; pointer.y += (pointer.ty - pointer.y) * 0.2;
      pointer.on += (pointer.target - pointer.on) * 0.08;
      const pulse = pulseRef.current, origin = originRef?.current;
      if (pulse && origin && time - lastPulse >= PULSES[pulse][0]) {
        const box = origin.getBoundingClientRect();
        if (box.width) addRipple(box.left + box.width / 2 - rect.left, box.top + box.height / 2 - rect.top, PULSES[pulse][1]);
        lastPulse = time;
      }
      while (ripples.length && time - ripples[0].at > RIPPLE_LIFE) ripples.shift();
      draw(false);
      frame = requestAnimationFrame(tick);
    }
    function addRipple(x: number, y: number, power: number) {
      ripples.push({ x, y, at: time, power });
      if (ripples.length > MAX_RIPPLES) ripples.shift();
    }
    const burstTimers: ReturnType<typeof setTimeout>[] = [];
    function burst() {
      if (motion.matches) return;
      const box = originRef?.current?.getBoundingClientRect();
      const x = box?.width ? box.left + box.width / 2 - rect.left : width / 2;
      const y = box?.width ? box.top + box.height / 2 - rect.top : height / 2;
      addRipple(x, y, 1); start();
      burstTimers.push(setTimeout(() => { addRipple(x, y, 0.9); start(); }, 150), setTimeout(() => { addRipple(x, y, 0.75); start(); }, 300));
    }
    function start() {
      if (motion.matches) { draw(true); return; }
      if (frame === null && !document.hidden) { previous = 0; frame = requestAnimationFrame(tick); }
    }
    function resize() { layout(); if (motion.matches) draw(true); else start(); }
    function move(event: PointerEvent) {
      pointer.tx = event.clientX - rect.left; pointer.ty = event.clientY - rect.top;
      if (pointer.target === 0) { pointer.x = pointer.tx; pointer.y = pointer.ty; }
      pointer.target = 1; start();
    }
    function down(event: PointerEvent) {
      const x = event.clientX - rect.left, y = event.clientY - rect.top;
      if (x >= 0 && y >= 0 && x <= width && y <= height) { addRipple(x, y, 1); start(); }
    }
    function leave(event: PointerEvent) { if (!event.relatedTarget) pointer.target = 0; }
    function blur() { pointer.target = 0; }
    function scrolled() { rect = canvas!.getBoundingClientRect(); }
    function visibility() { if (!document.hidden) start(); }

    layout();
    wakeRef.current = start;
    burstRef.current = burst;
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerdown", down, { passive: true });
    document.addEventListener("pointerout", leave);
    window.addEventListener("blur", blur);
    window.addEventListener("scroll", scrolled, { passive: true });
    document.addEventListener("visibilitychange", visibility);
    motion.addEventListener("change", resize);
    start();
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      wakeRef.current = () => {};
      burstRef.current = () => {};
      burstTimers.forEach(clearTimeout);
      observer.disconnect();
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerdown", down);
      document.removeEventListener("pointerout", leave);
      window.removeEventListener("blur", blur);
      window.removeEventListener("scroll", scrolled);
      document.removeEventListener("visibilitychange", visibility);
      motion.removeEventListener("change", resize);
    };
  }, [gap, originRef]);

  return <canvas ref={canvasRef} aria-hidden="true" className={className} />;
}
