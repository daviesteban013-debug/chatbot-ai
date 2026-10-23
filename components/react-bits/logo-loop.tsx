import type { CSSProperties, ReactNode } from "react";

/**
 * React Bits «LogoLoop», in CSS only (reactbits.dev, MIT + Commons Clause): an endless row that
 * drifts sideways and fades at both ends. It stops under the pointer or keyboard focus, and with
 * reduced motion the items wrap in place. The copies that close the loop are hidden from screen
 * readers.
 */
export function LogoLoop({ items, label, seconds = 32 }: { items: { id: string; node: ReactNode }[]; label: string; seconds?: number }) {
  return (
    <div className="rb-loop">
      <ul aria-label={label} className="rb-loop-track" style={{ "--rb-loop-seconds": `${seconds}s` } as CSSProperties}>
        {[0, 1, 2].flatMap(copy => items.map(item => <li key={`${copy}-${item.id}`} aria-hidden={copy > 0 || undefined}>{item.node}</li>))}
      </ul>
    </div>
  );
}
