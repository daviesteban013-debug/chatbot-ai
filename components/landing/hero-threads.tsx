"use client";

import { useEffect, useRef, useState } from "react";
import { WebThreads } from "@/components/react-bits/backgrounds/web-threads";
import { useIntroDone } from "./event-horizon/use-intro-done";

type Aim = { pinch: number; position: number };

/**
 * Golden threads (React Bits «Web Threads») that converge where Zorax's orb sits ([data-zx-orb]),
 * with light running along them like messages on their way to the agent. They draw in as the
 * intro opens and follow the orb when the layout changes.
 */
export function HeroThreads({ className }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const ready = useIntroDone();
  const [aim, setAim] = useState<Aim | null>(null);

  useEffect(() => {
    const box = ref.current;
    const orb = document.querySelector("[data-zx-orb]");
    if (!box || !orb) return;
    const measure = () => {
      const area = box.getBoundingClientRect();
      const target = orb.getBoundingClientRect();
      if (!area.width || !area.height) return;
      setAim({
        pinch: (target.left + target.width / 2 - area.left) / area.width,
        position: 1 - (target.top + target.height / 2 - area.top) / area.height,
      });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    observer.observe(orb);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} aria-hidden="true" className={className}>
      {ready && aim && (
        <WebThreads
          colors={["#92400e", "#f59e0b", "#facc15", "#fde68a"]}
          coreColor="#fffbeb"
          threadCount={9}
          speed={0.16}
          frequency={4.2}
          spread={0.2}
          taper={0.6}
          pinch={aim.pinch}
          position={aim.position}
          glow={0.022}
          brightness={0.62}
          depth={0.3}
          pulses={0.5}
          fade={0.25}
          grain={0.03}
          dpr={1.5}
        />
      )}
    </div>
  );
}
