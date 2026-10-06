export const AUTH_DESTINATION = "/dashboard/jarvis";

/** Never forward authentication codes or allow another origin to receive them. */
export function safeAuthDestination(next: string | null, origin: string): URL | null {
  if (!next) return new URL(AUTH_DESTINATION, origin);
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return null;
  try {
    const url = new URL(next, origin);
    return url.origin === origin ? url : null;
  } catch { return null; }
}
