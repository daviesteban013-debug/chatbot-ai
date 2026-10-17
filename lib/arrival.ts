import { z } from "zod";

/**
 * The handoff between the welcome portal and the CRM. When the owner presses "Entrar a mi CRM"
 * the portal leaves a short note in sessionStorage; the CRM reads it once on arrival, raises a
 * curtain with the agent's name and lets the agent greet the owner by name. Nothing here is
 * trusted for anything but presentation, and the note dies with the tab or after two minutes.
 */
export const ARRIVAL_KEY = "nexo:arrival";
export const ARRIVAL_MAX_AGE_MS = 2 * 60 * 1000;

const arrivalSchema = z.object({
  agent: z.string().trim().min(1).max(24),
  you: z.string().trim().max(40),
  accent: z.string().regex(/^#[0-9a-f]{6}$/i),
  at: z.number().finite(),
}).strict();
export type Arrival = z.infer<typeof arrivalSchema>;

/** Reads a note written by the portal; null when missing, malformed, from the future or too old. */
export function parseArrival(raw: string | null | undefined, now: number, maxAgeMs = ARRIVAL_MAX_AGE_MS): Arrival | null {
  if (!raw) return null;
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return null; }
  const parsed = arrivalSchema.safeParse(value);
  if (!parsed.success) return null;
  const age = now - parsed.data.at;
  return age < 0 || age > maxAgeMs ? null : parsed.data;
}

/** The portal writes the note right before navigating to the CRM. Storage failures are ignored. */
export function rememberArrival(storage: Pick<Storage, "setItem">, note: Omit<Arrival, "at">, now = Date.now()): void {
  try { storage.setItem(ARRIVAL_KEY, JSON.stringify({ ...note, at: now })); } catch { /* Private mode or full storage: the CRM simply opens as usual. */ }
}

/** The CRM takes the note exactly once: a reload or a second visit opens the CRM normally. */
export function takeArrival(storage: Pick<Storage, "getItem" | "removeItem">, now = Date.now()): Arrival | null {
  try {
    const raw = storage.getItem(ARRIVAL_KEY);
    if (raw !== null) storage.removeItem(ARRIVAL_KEY);
    return parseArrival(raw, now);
  } catch { return null; }
}

/** What the agent says the first time it stands in the CRM, right after the portal. */
export function arrivalGreeting(arrival: Pick<Arrival, "you">): string {
  const you = arrival.you.trim();
  return `Ya estoy aquí${you ? `, ${you}` : ""}. Este es mi puesto: desde aquí hablamos y manejo tu CRM. ¿Por dónde empezamos?`;
}
