"use client";

import { useCallback, type ReactNode } from "react";

/**
 * React Bits «Magnet» (reactbits.dev, MIT + Commons Clause): the content leans toward the mouse
 * once it comes within `padding` pixels and springs back when it leaves. Mouse only; touch
 * screens and reduced motion leave it still.
 */
export function Magnet({ children, padding = 90, strength = 3, className }: { children: ReactNode; padding?: number; strength?: number; className?: string }) {
  const attach = useCallback((outer: HTMLSpanElement | null) => {
    const inner = outer?.firstElementChild;
    if (!outer || !(inner instanceof HTMLElement) || !matchMedia("(hover: hover) and (pointer: fine)").matches || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    let active = false;
    let last = { x: 0, y: 0 };
    // The outer box never moves, so it is the one measured.
    const pull = () => {
      frame = 0;
      const rect = outer.getBoundingClientRect();
      const x = last.x - (rect.left + rect.width / 2);
      const y = last.y - (rect.top + rect.height / 2);
      const near = Math.abs(x) < rect.width / 2 + padding && Math.abs(y) < rect.height / 2 + padding;
      if (!near && !active) return;
      active = near;
      inner.style.transition = near ? "transform 0.3s ease-out" : "transform 0.5s ease-in-out";
      inner.style.transform = near ? `translate3d(${(x / strength).toFixed(1)}px, ${(y / strength).toFixed(1)}px, 0)` : "translate3d(0, 0, 0)";
    };
    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      last = { x: event.clientX, y: event.clientY };
      if (!frame) frame = requestAnimationFrame(pull);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(frame);
    };
  }, [padding, strength]);

  return <span ref={attach} className={className ? `inline-block ${className}` : "inline-block"}><span className="inline-block">{children}</span></span>;
}
