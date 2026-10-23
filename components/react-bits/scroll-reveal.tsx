"use client";

import { Fragment, useRef } from "react";
import { motion, useScroll, useTransform, type MotionValue } from "framer-motion";

function Word({ progress, range, accent, children }: { progress: MotionValue<number>; range: [number, number]; accent: boolean; children: string }) {
  const opacity = useTransform(progress, range, [0.14, 1]);
  const filter = useTransform(progress, range, ["blur(4px)", "blur(0px)"]);
  return <motion.span className={accent ? "rb-reveal-word text-yellow-300" : "rb-reveal-word"} style={{ opacity, filter }}>{children}</motion.span>;
}

/**
 * React Bits «ScrollReveal» (reactbits.dev, MIT + Commons Clause): the words of a heading light
 * up one by one while it scrolls into view. Each entry of `lines` starts after a `<br>` with
 * `breakClassName`, and the last `accent` words take the brand color. With reduced motion the
 * stylesheet keeps every word lit.
 */
export function ScrollReveal({ lines, accent = 0, breakClassName }: { lines: string[]; accent?: number; breakClassName?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 0.92", "start 0.4"] });
  const words = lines.map(line => line.split(" "));
  const total = words.flat().length;
  const firstOf = words.map((_, row) => words.slice(0, row).flat().length);
  return (
    <span ref={ref}>
      {words.map((line, row) => (
        <Fragment key={row}>
          {row > 0 && <br className={breakClassName} />}
          {line.map((word, column) => {
            const at = firstOf[row] + column;
            const start = (at / total) * 0.8;
            return <Fragment key={column}>{at > 0 && " "}<Word progress={scrollYProgress} range={[start, start + 0.2]} accent={at >= total - accent}>{word}</Word></Fragment>;
          })}
        </Fragment>
      ))}
    </span>
  );
}
