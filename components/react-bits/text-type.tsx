"use client";

import { useEffect, useRef, useState } from "react";
import { useInView } from "framer-motion";

/**
 * React Bits «TextType» (reactbits.dev, MIT + Commons Clause): types `text` out behind a cursor
 * once it is on screen and not `paused`; the cursor blinks a few times at the end and goes
 * away. The whole text holds its space from the start, so nothing around it moves, and reduced
 * motion shows it at once. It is hidden from screen readers: put the same text next to it in
 * `sr-only`.
 */
export function TextType({ text, speed = 28, paused = false }: { text: string; speed?: number; paused?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!inView || paused || count >= text.length) return;
    const timer = window.setTimeout(() => setCount(count + 1), speed);
    return () => window.clearTimeout(timer);
  }, [count, inView, paused, speed, text.length]);

  return (
    <span ref={ref} aria-hidden="true" className="rb-type">
      <span className="rb-type-full">{text}</span>
      <span className="rb-type-typed">{text.slice(0, count)}<span className={count >= text.length ? "rb-type-cursor rb-type-done" : "rb-type-cursor"} /></span>
    </span>
  );
}
