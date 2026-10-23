"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { InlineScript } from "@/components/inline-script";
import { createBlackHole, shadowRadius } from "./black-hole";
import { INTRO_DONE } from "./use-intro-done";
import styles from "./event-horizon.module.css";

/** Seconds of each beat. Skipping starts the dive right away. */
const DRAW_AT = 1.3;
const IGNITE_AT = 2.2;
const TITLE_AT = 2.35;
const DIVE_AT = 3.2;
const DIVE_FOR = 0.95;
const START_DISTANCE = 42;
const DISTANCE = 13.5;
const FOCAL = 1.15;

const clamp = (value: number) => Math.min(1, Math.max(0, value));
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const easeOut = (t: number) => 1 - (1 - t) ** 3;
const easeIn = (t: number) => t * t * t;

// Runs before the first paint: the intro covers the page only on a fresh visit (once per tab),
// never for reduced motion, crawlers or links to a section; `?intro` forces it. Until React takes
// over (data-live), a tap or key and a 6 s timeout give the page back, so a slow script never
// leaves anyone stuck behind it.
const DECIDE = `(function(){try{var el=document.getElementById("zx-intro");if(!el)return;var seen=false;try{seen=sessionStorage.getItem("zx-intro")==="1"}catch(e){}var force=/[?&]intro(=|&|$)/.test(location.search);var bot=/bot|crawl|spider|slurp|lighthouse|headless/i.test(navigator.userAgent);var still=matchMedia("(prefers-reduced-motion: reduce)").matches;if(!force&&(seen||still||bot||location.hash))return;el.setAttribute("data-play","");var stop=function(){if(!el.hasAttribute("data-live"))el.removeAttribute("data-play")};setTimeout(stop,6000);addEventListener("keydown",stop,{once:true});el.addEventListener("pointerdown",stop,{once:true})}catch(e){}})();`;

/**
 * The landing's entrance: a ray-traced black hole forms, Zorax's "Z" draws itself inside its
 * shadow and the node ignites; then the camera dives in, the page appears through the event
 * horizon and the mark flies to its place in the navbar ([data-zx-mark]). It plays once per tab,
 * any tap, key or scroll skips to the dive, and nothing of the page underneath changes.
 */
export function EventHorizon() {
  const rootRef = useRef<HTMLDivElement>(null);
  const markRef = useRef<SVGSVGElement>(null);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const root = rootRef.current;
    const mark = markRef.current;
    if (!root || !mark || !root.hasAttribute("data-play")) return;
    root.setAttribute("data-live", "");
    try { sessionStorage.setItem("zx-intro", "1"); } catch {}

    const canvas = document.createElement("canvas");
    canvas.className = styles.canvas;
    canvas.setAttribute("aria-hidden", "true");
    root.prepend(canvas);
    const hole = createBlackHole(canvas);
    if (!hole) root.setAttribute("data-flat", "");

    let frame = 0;
    let start = 0;
    let diveAt = DIVE_AT;
    let focalEnd = 0;
    let finished = false;
    let flight: Animation | null = null;
    const look = { x: 0, y: 0, toX: 0, toY: 0 };

    const size = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5, 1600 / Math.max(window.innerWidth, 1));
      canvas.width = Math.max(1, Math.round(window.innerWidth * ratio));
      canvas.height = Math.max(1, Math.round(window.innerHeight * ratio));
    };

    // The mark lands on the navbar's own, same geometry, so it reads as one object.
    const flyHome = () => {
      const target = document.querySelector("[data-zx-mark]")?.getBoundingClientRect();
      const from = mark.getBoundingClientRect();
      if (!target?.width || !from.width) {
        flight = mark.animate([{ opacity: 1 }, { opacity: 0, transform: "scale(1.4)" }], { duration: 420, fill: "forwards" });
        return;
      }
      const dx = target.left + target.width / 2 - (from.left + from.width / 2);
      const dy = target.top + target.height / 2 - (from.top + from.height / 2);
      const landed = `translate(${dx}px, ${dy}px) scale(${target.width / from.width})`;
      flight = mark.animate(
        [{ transform: "none", opacity: 1 }, { transform: landed, opacity: 1, offset: 0.9 }, { transform: landed, opacity: 0 }],
        { duration: DIVE_FOR * 1000, easing: "cubic-bezier(0.7, 0, 0.25, 1)", fill: "forwards" },
      );
    };

    const finish = () => {
      if (finished) return;
      finished = true;
      cancelAnimationFrame(frame);
      root.removeAttribute("data-play");
      window.dispatchEvent(new Event(INTRO_DONE));
      setGone(true);
    };

    const tick = (now: number) => {
      if (!start) start = now;
      const t = (now - start) / 1000;
      if (t >= DRAW_AT) root.setAttribute("data-draw", "");
      if (t >= IGNITE_AT) root.setAttribute("data-ignite", "");
      if (t >= TITLE_AT) root.setAttribute("data-title", "");
      look.x += (look.toX - look.x) * 0.04;
      look.y += (look.toY - look.y) * 0.04;

      const distance = START_DISTANCE - (START_DISTANCE - DISTANCE) * easeInOut(clamp(t / 2.8));
      const dive = clamp((t - diveAt) / DIVE_FOR);
      const unit = Math.min(window.innerWidth, window.innerHeight);
      const corner = Math.hypot(window.innerWidth, window.innerHeight) / 2;
      if (dive > 0 && !root.hasAttribute("data-dive")) {
        // Zoom so the shadow reaches the corners exactly when the dive ends.
        focalEnd = (corner * 1.06) / (shadowRadius(distance, 1) * unit);
        root.setAttribute("data-dive", "");
        window.dispatchEvent(new Event(INTRO_DONE));
        flyHome();
      }
      const focal = FOCAL + (Math.max(focalEnd, FOCAL) - FOCAL) * easeIn(dive);
      hole?.draw({
        time: t,
        distance,
        focal,
        tilt: 0.17 + 0.015 * Math.sin(t * 0.7),
        // The disk burns out as the shadow takes the whole screen.
        disk: easeOut(clamp((t - 0.1) / 1.7)) * (1 - easeIn(clamp((dive - 0.45) / 0.55))),
        reveal: easeOut(clamp(dive / 0.18)),
        exposure: 1.35 * easeOut(clamp(t / 1)),
        lookX: look.x,
        lookY: look.y,
      });
      if (dive > 0) {
        // Without WebGL a plain circle opens instead of the shadow.
        if (!hole) root.style.setProperty("--zx-iris", `${(corner * 1.06 * easeIn(dive)).toFixed(1)}px`);
        if (dive >= 1) {
          finish();
          return;
        }
      }
      frame = requestAnimationFrame(tick);
    };

    const skip = () => {
      const t = start ? (performance.now() - start) / 1000 : 0;
      if (t < diveAt) diveAt = t;
    };
    const lookAt = (event: PointerEvent) => {
      look.toX = (event.clientX / window.innerWidth - 0.5) * 2;
      look.toY = -(event.clientY / window.innerHeight - 0.5) * 2;
    };

    size();
    window.addEventListener("resize", size);
    window.addEventListener("pointermove", lookAt, { passive: true });
    window.addEventListener("pointerdown", skip);
    window.addEventListener("keydown", skip);
    window.addEventListener("wheel", skip, { passive: true });
    window.addEventListener("touchmove", skip, { passive: true });
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", size);
      window.removeEventListener("pointermove", lookAt);
      window.removeEventListener("pointerdown", skip);
      window.removeEventListener("keydown", skip);
      window.removeEventListener("wheel", skip);
      window.removeEventListener("touchmove", skip);
      flight?.cancel();
      hole?.dispose();
      canvas.remove();
    };
  }, []);

  if (gone) return null;
  return (
    <>
      <div ref={rootRef} id="zx-intro" className={styles.intro} suppressHydrationWarning>
        <div className={styles.flat} aria-hidden="true" />
        <div className={styles.center} aria-hidden="true">
          <svg ref={markRef} className={styles.mark} viewBox="0 0 32 32">
            <path className={styles.stroke} d="M9.5 9.5h13l-13 13h13" pathLength={1} />
            <circle className={styles.pulse} cx="22.5" cy="22.5" r="2.6" />
            <circle className={styles.node} cx="22.5" cy="22.5" r="2.6" />
          </svg>
        </div>
        <p className={styles.title} aria-hidden="true">
          <span className={styles.word}>{["Z", "O", "R", "A", "X"].map((letter, index) => <span key={index} style={{ "--i": index } as CSSProperties}>{letter}</span>)}</span>
          <span className={styles.tagline}>Tu vendedor de IA por WhatsApp</span>
        </p>
        <button type="button" className={styles.skip}>Saltar intro</button>
      </div>
      <InlineScript html={DECIDE} />
    </>
  );
}
