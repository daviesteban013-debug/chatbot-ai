"use client";

import { useEffect, useRef } from "react";
import { createBlackHole } from "@/components/landing/event-horizon/black-hole";

/** The shared-link image: the intro's black hole at its held frame, with the mark in its shadow. */
export function OgFrame() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const box = ref.current;
    if (!box) return;
    const canvas = document.createElement("canvas");
    canvas.width = 2400;
    canvas.height = 1260;
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%";
    box.prepend(canvas);
    const hole = createBlackHole(canvas);
    hole?.draw({ time: 2.9, distance: 13.5, focal: 1.15, tilt: 0.17, disk: 1, reveal: 0, exposure: 1.3, lookX: 0, lookY: 0 });
    box.setAttribute("data-ready", hole ? "webgl" : "flat");
    return () => {
      hole?.dispose();
      canvas.remove();
    };
  }, []);

  return (
    <div ref={ref} className="fixed left-0 top-0 h-[630px] w-[1200px] overflow-hidden bg-[#030304]">
      <svg viewBox="0 0 32 32" className="absolute left-[505px] top-[220px] size-[190px] overflow-visible drop-shadow-[0_0_16px_rgb(255_240_200/0.32)]" aria-hidden="true">
        <path d="M9.5 9.5h13l-13 13h13" fill="none" stroke="#fafafa" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="22.5" cy="22.5" r="2.6" fill="#facc15" />
      </svg>
      <p className="absolute inset-x-0 bottom-[38px] m-0 text-center text-[19px] font-medium tracking-[0.02em] text-zinc-200 [text-shadow:0_0_18px_rgb(3_3_4/0.95),0_0_4px_rgb(3_3_4/0.9)]">
        <span className="mr-3 font-semibold tracking-[0.5em] text-white">ZORAX</span>Tu vendedor de IA por WhatsApp
      </p>
    </div>
  );
}
