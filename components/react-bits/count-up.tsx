"use client";

import { useEffect, useRef, useState } from "react";
import { animate, useReducedMotion } from "framer-motion";

/**
 * React Bits «CountUp» (reactbits.dev, MIT + Commons Clause): the number counts to its new value
 * each time `value` changes. The server renders the value as it is, and screen readers only get
 * the final value, never the numbers in between.
 */
export function CountUp({ value, format, duration = 0.7 }: { value: number; format: (value: number) => string; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef(value);
  // React renders this text once; the counting writes to the node directly afterwards.
  const [first] = useState(() => format(value));
  const reduced = useReducedMotion();

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (reduced || shown.current === value) {
      shown.current = value;
      node.textContent = format(value);
      return;
    }
    const controls = animate(shown.current, value, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: latest => { shown.current = latest; node.textContent = format(latest); },
    });
    return () => controls.stop();
  }, [value, format, duration, reduced]);

  return <><span ref={ref} aria-hidden="true">{first}</span><span className="sr-only">{format(value)}</span></>;
}
