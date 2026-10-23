import { Fragment, type CSSProperties, type ReactNode } from "react";

/**
 * React Bits «BlurText», in CSS only (reactbits.dev, MIT + Commons Clause): each word falls into
 * place out of a blur, one after another. It plays on the first paint without waiting for
 * JavaScript, and the landing's reduced-motion rule shows the words as they are.
 */
export function BlurWord({ index, className, children }: { index: number; className?: string; children: ReactNode }) {
  return <span className={className ? `rb-blur ${className}` : "rb-blur"} style={{ "--rb-i": index } as CSSProperties}>{children}</span>;
}

/** The words of `text` as `BlurWord`s; `start` continues the order of an earlier piece of the same heading. */
export function BlurText({ text, start = 0, className }: { text: string; start?: number; className?: string }) {
  return text.split(" ").map((word, index) => <Fragment key={index}>{index > 0 && " "}<BlurWord index={start + index} className={className}>{word}</BlurWord></Fragment>);
}
