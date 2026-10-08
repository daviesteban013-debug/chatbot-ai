/** Local gate: no upload for silence; bounded phrases with a quiet tail. */
export function createVoiceActivity() {
  let start = 0, lastVoice = 0, voiced = 0, previous = 0, noise = 0.004;
  return {
    sample(rms: number, now: number): "start" | "finish" | null {
      const delta = previous ? Math.min(100, Math.max(0, now - previous)) : 0;
      previous = now;
      const speech = rms > Math.max(0.018, noise * 3);
      if (!start && !speech) noise = noise * 0.98 + rms * 0.02;
      if (speech) {
        lastVoice = now;
        voiced += delta;
        if (!start) { start = now; return "start"; }
      }
      if (start && (now - start >= 12_000 || (voiced >= 250 && now - lastVoice >= 700) || (voiced < 250 && now - lastVoice >= 1000))) return "finish";
      return null;
    },
    duration(now: number) { return start ? Math.min(12_000, now - start) : 0; },
    valid() { return voiced >= 250; },
    reset() { start = lastVoice = voiced = previous = 0; },
  };
}
