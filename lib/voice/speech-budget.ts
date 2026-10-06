const WINDOW_MS = 10 * 60 * 1000;
const MAX_CHARACTERS = 20_000;
const MAX_USERS = 2000;

/** A per-process guard; serverless instances do not share this budget. */
export function createSpeechBudget() {
  const entries = new Map<string, { expires: number; characters: number; last: number; active: boolean; slots: number }>();
  return (userId: string, characters: number, now = Date.now()): (() => void) | null => {
    for (const [id, entry] of entries) if (entry.expires <= now && !entry.active) entries.delete(id);
    let entry = entries.get(userId);
    if (entry?.active) return null;
    if (!entry) {
      if (entries.size >= MAX_USERS) return null;
      entry = { expires: now + WINDOW_MS, characters: 0, last: now, active: false, slots: 3 };
      entries.set(userId, entry);
    }
    // A short spoken turn may contain two sentences and a details cue.
    // Allow that burst while still replenishing only one request every 2s.
    entry.slots = Math.min(3, entry.slots + Math.max(0, now - entry.last) / 2000);
    entry.last = now;
    if (entry.slots < 1) return null;
    if (entry.characters + characters > MAX_CHARACTERS) return null;
    entry.slots--;
    entry.characters += characters;
    entry.last = now;
    entry.active = true;
    return () => { entry.active = false; };
  };
}
