export interface NeuralPlaybackCallbacks {
  activity: (speaking: boolean) => void;
  pending: (pending: boolean) => void;
  ready: (ready: boolean) => void;
  error: (message: string) => void;
}

/** Abortable MSE operations: stop must release sourceopen/updateend waits. */
function mediaEvent(target: EventTarget, event: string, signal: AbortSignal, action?: () => void) {
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      target.removeEventListener(event, success); target.removeEventListener("error", failure);
      signal.removeEventListener("abort", failure);
    };
    const success = () => { cleanup(); resolve(); };
    const failure = () => { cleanup(); reject(new Error("Audio interrumpido.")); };
    target.addEventListener(event, success, { once: true });
    target.addEventListener("error", failure, { once: true });
    signal.addEventListener("abort", failure, { once: true });
    if (signal.aborted) { failure(); return; }
    try { action?.(); } catch { failure(); }
  });
}

/** One request/player at a time; canceled requests can never start late audio. */
export function createNeuralPlayback(callbacks: NeuralPlaybackCallbacks) {
  let generation = 0;
  let abort: AbortController | null = null;
  let audio: HTMLAudioElement | null = null;
  let objectUrl: string | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let completed: ((success: boolean) => void) | undefined;
  const stop = () => {
    generation++;
    abort?.abort(); abort = null;
    if (timer) clearTimeout(timer);
    timer = null;
    if (audio) {
      audio.onplaying = null; audio.onended = null; audio.onerror = null; audio.onwaiting = null;
      audio.pause(); audio.removeAttribute("src"); audio.load(); audio = null;
    }
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = null;
    const finish = completed; completed = undefined;
    callbacks.activity(false); callbacks.pending(false); callbacks.ready(false);
    finish?.(false);
  };
  const play = async () => {
    const player = audio;
    const current = generation;
    if (!player) return;
    try { await player.play(); }
    catch (error) {
      if (current !== generation) return;
      if (error instanceof Error && error.name === "NotAllowedError") {
        callbacks.pending(false); callbacks.ready(true);
        callbacks.error("Tu navegador pide un toque para reproducir. Pulsa Reproducir voz.");
      } else { stop(); callbacks.error("No se pudo reproducir el audio. Inténtalo de nuevo."); }
    }
  };
  const attach = (current: number) => {
    const player = new Audio();
    audio = player;
    player.onplaying = () => { if (current === generation) { callbacks.pending(false); callbacks.ready(false); callbacks.activity(true); } };
    player.onwaiting = () => { if (current === generation) { callbacks.activity(false); callbacks.pending(true); } };
    player.onended = () => {
      if (current !== generation) return;
      const finish = completed; completed = undefined;
      stop(); finish?.(true);
    };
    player.onerror = () => { if (current === generation) { stop(); callbacks.error("El navegador no pudo reproducir esta voz."); } };
    return player;
  };
  const speak = async (payload: unknown, onFinished?: (success: boolean) => void) => {
    stop();
    completed = onFinished;
    const current = generation;
    const controller = new AbortController();
    abort = controller;
    timer = setTimeout(() => controller.abort(), 50_000);
    callbacks.pending(true);
    try {
      const response = await fetch("/api/jarvis/voice", {
        method: "POST", credentials: "same-origin", cache: "no-store", signal: controller.signal,
        headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      if (current !== generation) { await response.body?.cancel(); return; }
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(typeof data?.error === "string" ? data.error.slice(0, 240) : "No se pudo generar la voz de ElevenLabs.");
      }
      if (!response.headers.get("content-type")?.startsWith("audio/")) throw new Error("No se recibió un audio válido.");
      const mime = response.headers.get("content-type")!.split(";")[0];
      if (response.body && typeof MediaSource !== "undefined" && MediaSource.isTypeSupported(mime)) {
        const source = new MediaSource();
        const player = attach(current);
        objectUrl = URL.createObjectURL(source);
        const opened = mediaEvent(source, "sourceopen", controller.signal);
        player.src = objectUrl;
        await opened;
        const buffer = source.addSourceBuffer(mime);
        const reader = response.body.getReader();
        let bytes = 0;
        let started = false;
        try {
          while (true) {
            const chunk = await reader.read();
            if (current !== generation) { await reader.cancel(); return; }
            if (chunk.done) break;
            if (!chunk.value.byteLength) continue;
            bytes += chunk.value.byteLength;
            await mediaEvent(buffer, "updateend", controller.signal, () => buffer.appendBuffer(chunk.value));
            if (!started) { started = true; void play(); }
          }
          if (!bytes) throw new Error("No se recibió un audio válido.");
          if (source.readyState === "open") source.endOfStream();
        } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
      } else {
        // Without MP3 MSE, download only the short sentence being spoken.
        const blob = await response.blob();
        if (current !== generation) return;
        if (!blob.size) throw new Error("No se recibió un audio válido.");
        const player = attach(current);
        objectUrl = URL.createObjectURL(blob);
        player.src = objectUrl;
        callbacks.pending(false);
        await play();
      }
      if (current !== generation) return;
      if (timer) clearTimeout(timer);
      timer = null; abort = null;
    } catch (error) {
      if (current !== generation) return;
      const timedOut = controller.signal.aborted;
      stop();
      callbacks.error(timedOut ? "El audio tardó demasiado. Vuelve a intentarlo." : error instanceof Error ? error.message : "No se pudo generar la voz. Revisa tu conexión.");
    }
  };
  return { speak, stop, play, setActivity: (activity: NeuralPlaybackCallbacks["activity"]) => { callbacks.activity = activity; } };
}
