const WINDOW_MS = 10 * 60 * 1000;
const MAX_CHARACTERS = 20_000;
const MAX_USERS = 2000;

/** A per-process guard; serverless instances do not share this budget. */
export function createSpeechBudget() {
  const entries = new Map<string, { expires: number; characters: number; last: number; active: boolean }>();
  return (userId: string, characters: number, now = Date.now()): (() => void) | null => {
    for (const [id, entry] of entries) if (entry.expires <= now && !entry.active) entries.delete(id);
    let entry = entries.get(userId);
    if (entry?.active || (entry && now - entry.last < 2000)) return null;
    if (!entry) {
      if (entries.size >= MAX_USERS) return null;
      entry = { expires: now + WINDOW_MS, characters: 0, last: -Infinity, active: false };
      entries.set(userId, entry);
    }
    if (entry.characters + characters > MAX_CHARACTERS) return null;
    entry.characters += characters;
    entry.last = now;
    entry.active = true;
    return () => { entry.active = false; };
  };
}
