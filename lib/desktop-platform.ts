export type DesktopPlatform = "windows" | "mac";

/**
 * Where the Zorax desktop app can run for this visitor: Windows or macOS on a computer. Phones, tablets
 * (iPadOS reports itself as a Mac with touch) and other systems get null. Browser only.
 */
export function desktopPlatform(): DesktopPlatform | null {
  const agent = navigator.userAgent;
  if (/Android|iPhone|iPad|Mobile/i.test(agent)) return null;
  if (/Windows/i.test(agent)) return "windows";
  if (/Macintosh|Mac OS X/i.test(agent)) return navigator.maxTouchPoints > 1 ? null : "mac";
  return null;
}
