"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useInView, useReducedMotion } from "framer-motion";

/**
 * React Bits «RotatingText» (reactbits.dev, MIT + Commons Clause): phrases take turns inside a
 * highlighted pill, letter by letter, while the pill eases to the width of each one. Screen
 * readers hear `label` instead of the changing phrase. It waits while off screen or under the
 * pointer, and stays on the first phrase with reduced motion.
 */
export function RotatingText({ texts, label, interval = 2200, className }: { texts: string[]; label: string; interval?: number; className?: string }) {
  const rootRef = useRef<HTMLSpanElement>(null);
  const contentRef = useRef<HTMLSpanElement>(null);
  const [index, setIndex] = useState(0);
  const [hovered, setHovered] = useState(false);
  const inView = useInView(rootRef);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (!inView || hovered || reduced || texts.length < 2) return;
    const timer = window.setTimeout(() => setIndex(current => (current + 1) % texts.length), interval);
    return () => window.clearTimeout(timer);
  }, [index, inView, hovered, reduced, interval, texts.length]);

  // The pill takes the width of the phrase inside it, so each change of size can ease.
  useEffect(() => {
    const root = rootRef.current;
    const content = contentRef.current;
    if (!root || !content) return;
    const fit = () => { root.style.width = `${content.offsetWidth + 1}px`; };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

  const letters = Array.from(texts[index] ?? "");
  return (
    <span ref={rootRef} className={className ? `rb-rotating ${className}` : "rb-rotating"} onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)}>
      <span className="sr-only">{label}</span>
      <span ref={contentRef} aria-hidden="true" className="rb-rotating-content">
        <AnimatePresence mode="wait" initial={false}>
          <motion.span key={index} className="rb-rotating-content">
            {letters.map((letter, position) => (
              <motion.span
                key={position}
                className="inline-block"
                initial={{ y: "100%", opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: "-120%", opacity: 0 }}
                transition={{ type: "spring", damping: 30, stiffness: 400, delay: (letters.length - 1 - position) * 0.025 }}
              >
                {letter}
              </motion.span>
            ))}
          </motion.span>
        </AnimatePresence>
      </span>
    </span>
  );
}
