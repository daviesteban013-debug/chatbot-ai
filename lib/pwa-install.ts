export interface InstallPromptEvent extends Event {
  prompt(): Promise<{ outcome: "accepted" | "dismissed" }>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function isAppleMobile(userAgent: string, touchPoints: number) {
  return /iPhone|iPad|iPod/i.test(userAgent) || (/Macintosh/i.test(userAgent) && touchPoints > 1);
}

/** Consume each browser event exactly once; a new event enables a new attempt. */
export function createInstallRequest() {
  let deferred: InstallPromptEvent | null = null;
  let requesting = false;
  return {
    capture(event: InstallPromptEvent) { event.preventDefault(); deferred = event; },
    clear() { deferred = null; },
    async request(): Promise<"accepted" | "dismissed" | "unavailable"> {
      if (!deferred || requesting) return "unavailable";
      const event = deferred;
      deferred = null;
      requesting = true;
      try {
        // Must run immediately within the user's click, before awaiting anything.
        await event.prompt();
        return (await event.userChoice).outcome;
      } catch {
        return "unavailable";
      } finally { requesting = false; }
    },
  };
}
