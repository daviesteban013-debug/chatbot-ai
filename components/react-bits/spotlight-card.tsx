"use client";

import { useCallback, type HTMLAttributes } from "react";

type Card = { element: HTMLElement; reach: number };

// One pointer listener and one frame for every card on the page.
const cards = new Set<Card>();
let pointer: { x: number; y: number } | null = null;
let frame = 0;

function paint() {
  frame = 0;
  for (const { element, reach } of cards) {
    if (!pointer) { element.style.setProperty("--rb-spot", "0"); continue; }
    const rect = element.getBoundingClientRect();
    const x = pointer.x - rect.left;
    const y = pointer.y - rect.top;
    const gap = Math.hypot(Math.max(0, -x, x - rect.width), Math.max(0, -y, y - rect.height));
    const presence = gap === 0 ? 1 : Math.max(0, 1 - gap / reach) ** 2;
    element.style.setProperty("--rb-spot", presence.toFixed(3));
    if (presence > 0) {
      element.style.setProperty("--rb-x", `${x.toFixed(1)}px`);
      element.style.setProperty("--rb-y", `${y.toFixed(1)}px`);
    }
  }
}

const schedule = () => { if (!frame) frame = requestAnimationFrame(paint); };
const onMove = (event: PointerEvent) => {
  if (event.pointerType !== "mouse") return;
  pointer = { x: event.clientX, y: event.clientY };
  schedule();
};
const onOut = (event: PointerEvent) => {
  if (event.relatedTarget) return;
  pointer = null;
  schedule();
};
const onScroll = () => { if (pointer) schedule(); };

function track(element: HTMLElement, reach: number) {
  if (!matchMedia("(hover: hover) and (pointer: fine)").matches || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const card = { element, reach };
  if (!cards.size) {
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("pointerout", onOut);
  }
  cards.add(card);
  return () => {
    cards.delete(card);
    if (cards.size) return;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("scroll", onScroll);
    document.removeEventListener("pointerout", onOut);
    cancelAnimationFrame(frame);
    frame = 0;
  };
}

/**
 * React Bits «SpotlightCard» (reactbits.dev, MIT + Commons Clause): a soft light follows the mouse
 * over the card and lights its border as the pointer comes within `reach` pixels. Mouse only;
 * touch screens and reduced motion keep the card as it is.
 */
export function SpotlightCard({ as: Tag = "div", reach = 90, className, children, ...rest }: HTMLAttributes<HTMLElement> & { as?: "div" | "article"; reach?: number }) {
  const attach = useCallback((element: HTMLElement | null) => (element ? track(element, reach) : undefined), [reach]);
  return (
    <Tag ref={attach} className={className ? `rb-spotlight ${className}` : "rb-spotlight"} {...rest}>
      <span aria-hidden="true" className="rb-spotlight-fill" />
      {children}
      <span aria-hidden="true" className="rb-spotlight-edge" />
    </Tag>
  );
}
