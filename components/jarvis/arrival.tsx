"use client";
import { useEffect, useState, type CSSProperties } from "react";
import type { Arrival } from "@/lib/arrival";
import styles from "./arrival.module.css";

/**
 * The curtain the agent walks through from the welcome portal: its name on dark, in the color
 * the owner chose, then it lifts and the CRM is behind it. `onLift` fires when the CRM starts
 * showing (the moment to let the agent speak), `onDone` when the curtain is gone.
 */
export function ArrivalCurtain({ arrival, onLift, onDone }: { arrival: Arrival; onLift(): void; onDone(): void }) {
  const [lifted, setLifted] = useState(false);
  useEffect(() => {
    const lift = setTimeout(() => { setLifted(true); onLift(); }, 700);
    const done = setTimeout(onDone, 1700);
    return () => { clearTimeout(lift); clearTimeout(done); };
  // One run per arrival; the callbacks are read when the timers fire.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <div className={styles.curtain} data-lifted={lifted} style={{ "--nexo-color": arrival.accent } as CSSProperties} aria-hidden="true">
    <div className={styles.card}><span>{arrival.agent.toUpperCase()}</span><small>YA ESTÁ EN TU CRM</small></div>
  </div>;
}
