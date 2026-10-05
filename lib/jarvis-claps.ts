/** Local transient detector. This is a gesture heuristic, not speech recognition. */
export interface ClapFrame { rms: number; peak: number; crest: number }

export function measureClapFrame(samples: Float32Array): ClapFrame {
  let energy = 0, peak = 0;
  for (const sample of samples) { energy += sample * sample; peak = Math.max(peak, Math.abs(sample)); }
  const rms = Math.sqrt(energy / Math.max(1, samples.length));
  return { rms, peak, crest: peak / Math.max(rms, 0.0001) };
}

export function createDoubleClapDetector() {
  let started: number | null = null;
  let floor = 0.004, quietSince = 0, pulse = 0, pulseStart = 0, lastEnd = -1000;
  let firstClap: number | null = null;
  return {
    feed(frame: ClapFrame, now: number): boolean {
      if (started === null) { started = now; quietSince = now; }
      if (now - started < 650) {
        floor = floor * 0.9 + frame.rms * 0.1;
        quietSince = now;
        return false;
      }
      if (firstClap !== null && now - firstClap > 950) firstClap = null;
      const loud = frame.rms > Math.max(0.018, floor * 4) && frame.peak > 0.16;
      const quiet = frame.rms < Math.max(0.012, floor * 2);
      if (!pulse && loud) {
        // Require a quiet lead-in and a sharp crest; reject echoes and sustained noise.
        pulse = now - quietSince >= 60 && now - lastEnd >= 160 && frame.crest >= 2.5 ? 1 : 2;
        pulseStart = now;
      }
      if (pulse && !quiet) {
        if (now - pulseStart > 120) pulse = 2;
        quietSince = now;
        return false;
      }
      if (pulse && quiet) {
        const valid = pulse === 1 && now - pulseStart <= 120;
        pulse = 0; lastEnd = now; quietSince = now;
        if (!valid) { firstClap = null; return false; }
        if (firstClap !== null && now - firstClap >= 200 && now - firstClap <= 950) {
          firstClap = null;
          return true;
        }
        firstClap = now;
      }
      if (!loud) floor = floor * 0.98 + Math.min(frame.rms, 0.03) * 0.02;
      return false;
    },
  };
}

interface ClapDependencies {
  media: () => Promise<MediaStream>;
  audio: () => AudioContext;
  frame: (callback: FrameRequestCallback) => number;
  cancelFrame: (id: number) => void;
  now: () => number;
}
interface ClapCallbacks {
  pending: (value: boolean) => void;
  listening: (value: boolean) => void;
  error: (value: string | null) => void;
  clap: () => void;
}

/** Owns every audio resource and ignores permissions resolved after stop/unmount. */
export function createClapListener(deps: ClapDependencies, callbacks: ClapCallbacks) {
  let generation = 0, disposed = false;
  let stream: MediaStream | null = null, context: AudioContext | null = null;
  let source: MediaStreamAudioSourceNode | null = null, analyser: AnalyserNode | null = null;
  let frame: number | null = null, timer: ReturnType<typeof setTimeout> | null = null;
  const stop = () => {
    generation++;
    if (timer !== null) clearTimeout(timer);
    timer = null;
    if (frame !== null) deps.cancelFrame(frame);
    frame = null;
    source?.disconnect(); analyser?.disconnect();
    source = null; analyser = null;
    stream?.getTracks().forEach(track => { track.onended = null; track.stop(); }); stream = null;
    if (context) void context.close().catch(() => {});
    context = null;
    if (!disposed) { callbacks.pending(false); callbacks.listening(false); }
  };
  return {
    stop,
    async start() {
      if (disposed) return;
      stop();
      const current = generation;
      callbacks.error(null); callbacks.pending(true);
      const detector = createDoubleClapDetector();
      try {
        // Resume inside the user's click, before waiting for microphone permission.
        context = deps.audio();
        const resumed = context.resume().then(() => true, () => false);
        timer = setTimeout(() => {
          if (current !== generation) return;
          stop(); callbacks.error("No llegó el permiso del micrófono. Activa los aplausos para intentar de nuevo.");
        }, 30_000);
        const acquired = await deps.media();
        if (current !== generation || disposed) { acquired.getTracks().forEach(track => track.stop()); return; }
        stream = acquired;
        const ready = await resumed;
        if (current !== generation || disposed || !context) return;
        if (!ready || context.state !== "running") throw new Error("audio-suspended");
        if (timer !== null) clearTimeout(timer); timer = null;
        analyser = context.createAnalyser(); analyser.fftSize = 1024;
        source = context.createMediaStreamSource(stream); source.connect(analyser);
        // No destination connection: microphone audio is neither played nor uploaded.
        stream.getTracks().forEach(track => { track.onended = stop; });
        callbacks.pending(false); callbacks.listening(true);
        const samples = new Float32Array(analyser.fftSize);
        const tick = () => {
          if (current !== generation || disposed || !analyser) return;
          try {
            analyser.getFloatTimeDomainData(samples);
            if (detector.feed(measureClapFrame(samples), deps.now())) { stop(); callbacks.clap(); return; }
            frame = deps.frame(tick);
          } catch { stop(); callbacks.error("Se interrumpió la escucha. Puedes encender a Jarvis con el botón."); }
        };
        frame = deps.frame(tick);
      } catch (error) {
        if (current !== generation || disposed) return;
        stop();
        const name = error instanceof Error ? error.name : "";
        callbacks.error(name === "NotAllowedError" ? "Permite el micrófono para encender con aplausos. También puedes usar el botón o texto." : "No se pudo activar el micrófono. Revisa el permiso y el dispositivo de entrada.");
      }
    },
    dispose() { stop(); disposed = true; },
  };
}
