"use client";

import { useSyncExternalStore } from "react";

/** Fired on window when the intro starts opening onto the page, and again when it leaves. */
export const INTRO_DONE = "zx:intro-done";

const subscribe = (change: () => void) => {
  window.addEventListener(INTRO_DONE, change);
  return () => window.removeEventListener(INTRO_DONE, change);
};
const isDone = () => !document.querySelector("#zx-intro[data-play]:not([data-dive])");

/** False while the landing intro covers the page, so entrances can start as it opens. */
export function useIntroDone() {
  return useSyncExternalStore(subscribe, isDone, () => false);
}
