export interface NeuralPlaybackCallbacks {
  activity: (speaking: boolean) => void;
  pending: (pending: boolean) => void;
  ready: (ready: boolean) => void;
  error: (message: string) => void;
}

/** One request/player at a time; canceled requests can never start late audio. */
export function createNeuralPlayback(callbacks: NeuralPlaybackCallbacks) {
  let generation = 0;
  let abort: AbortController | null = null;
  let audio: HTMLAudioElement | null = null;
  let objectUrl: string | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const stop = () => {
    generation++;
    abort?.abort(); abort = null;
    if (timer) clearTimeout(timer);
    timer = null;
    if (audio) {
      audio.onplaying = null; audio.onended = null; audio.onerror = null;
      audio.pause(); audio.removeAttribute("src"); audio.load(); audio = null;
    }
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = null;
    callbacks.activity(false); callbacks.pending(false); callbacks.ready(false);
  };
  const play = async () => {
    const player = audio;
    const current = generation;
    if (!player) return;
    try { await player.play(); }
    catch (error) {
      if (current !== generation) return;
      if (error instanceof Error && error.name === "NotAllowedError") {
        callbacks.ready(true);
        callbacks.error("Tu navegador pide un toque para reproducir. Pulsa Reproducir voz.");
      } else { stop(); callbacks.error("No se pudo reproducir el audio. Inténtalo de nuevo."); }
    }
  };
  const speak = async (payload: unknown) => {
    stop();
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
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        // Only display the controlled messages returned by our own route.
        throw new Error(typeof data?.error === "string" ? data.error.slice(0, 240) : "No se pudo generar la voz de ElevenLabs.");
      }
      const blob = await response.blob();
      if (current !== generation) return;
      if (!blob.size || !blob.type.startsWith("audio/")) throw new Error("No se recibió un audio válido.");
      if (timer) clearTimeout(timer);
      timer = null; abort = null;
      callbacks.pending(false);
      objectUrl = URL.createObjectURL(blob);
      audio = new Audio(objectUrl);
      audio.onplaying = () => { if (current === generation) { callbacks.ready(false); callbacks.activity(true); } };
      audio.onended = () => { if (current === generation) stop(); };
      audio.onerror = () => { if (current === generation) { stop(); callbacks.error("El navegador no pudo reproducir esta voz."); } };
      await play();
    } catch (error) {
      if (current !== generation) return;
      stop();
      callbacks.error(controller.signal.aborted ? "El audio tardó demasiado. Vuelve a intentarlo." : error instanceof Error ? error.message : "No se pudo generar la voz. Revisa tu conexión.");
    }
  };
  return { speak, stop, play, setActivity: (activity: NeuralPlaybackCallbacks["activity"]) => { callbacks.activity = activity; } };
}
