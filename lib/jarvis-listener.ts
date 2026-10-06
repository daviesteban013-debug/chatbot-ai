export interface RecognitionEvent {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; [index: number]: { transcript: string } }>;
}

export interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onstart: (() => void) | null;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  abort(): void;
}

/** A user-armed recognition session. Pausing preserves intent; stopping revokes it. */
export function createJarvisListener(recognition: Recognition, callbacks: {
  listening: (value: boolean) => void;
  error: (message: string | null) => void;
  transcript: (text: string, wakeOnly: boolean) => boolean;
}) {
  let mode: "wake" | "conversation" | null = null;
  let continuous = false;
  let paused = false;
  let running = false;
  let abortExpected = false;
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let rapidEnds = 0;
  let startedAt = 0;
  const stop = () => {
    mode = null;
    if (timer) clearTimeout(timer);
    timer = null;
    try { if (running) { abortExpected = true; recognition.abort(); } } catch { /* Already disconnected. */ }
    callbacks.listening(false);
  };
  const begin = () => {
    if (!mode || paused || running || disposed) return;
    startedAt = Date.now();
    running = true;
    try { recognition.start(); }
    catch { running = false; stop(); callbacks.error("No se pudo iniciar el micrófono. Vuelve a activar la escucha."); }
  };
  const reconnect = () => {
    if (!mode || paused || running || timer || disposed) return;
    timer = setTimeout(() => { timer = null; begin(); }, 350);
  };
  const setPaused = (value: boolean) => {
    paused = value;
    if (value) {
      if (timer) clearTimeout(timer);
      timer = null;
      try { if (running) { abortExpected = true; recognition.abort(); } } catch { /* Already disconnected. */ }
      callbacks.listening(false);
    } else reconnect();
  };
  recognition.interimResults = false;
  recognition.onstart = () => {
    if (mode && !paused) callbacks.listening(true);
    else { try { recognition.abort(); } catch { /* Late permission result. */ } }
  };
  recognition.onresult = event => {
    if (!mode || paused || abortExpected || disposed) return;
    for (let index = event.resultIndex; index < event.results.length; index++) {
      const result = event.results[index];
      if (!result.isFinal) continue;
      const text = result[0]?.transcript.trim();
      if (text && callbacks.transcript(text, mode === "wake")) {
        // The UI resumes a continuous conversation only after its response/audio.
        if (mode) { if (continuous) setPaused(true); else stop(); }
        break;
      }
    }
  };
  recognition.onerror = event => {
    if (!mode || event.error === "no-speech" || (abortExpected && event.error === "aborted")) return;
    stop();
    const message = event.error === "not-allowed" || event.error === "service-not-allowed"
      ? "Permite el micrófono en tu navegador o usa Encender Jarvis y el chat."
      : event.error === "audio-capture"
        ? "El navegador no puede captar el micrófono. Comprueba que esté conectado y disponible."
        : event.error === "network"
          ? "El servicio de reconocimiento de voz no pudo conectarse. Prueba esta página en Chrome o Edge y revisa tu conexión."
          : "La escucha se detuvo. Puedes reactivarla o seguir por escrito.";
    callbacks.error(message);
  };
  recognition.onend = () => {
    const intentional = abortExpected;
    abortExpected = false;
    running = false;
    callbacks.listening(false);
    if (!mode || paused) return;
    if (mode !== "wake" && !continuous) { mode = null; return; }
    rapidEnds = intentional ? 0 : Date.now() - startedAt < 1000 ? rapidEnds + 1 : 0;
    if (rapidEnds >= 3) { stop(); callbacks.error("El navegador detuvo la escucha. Actívala de nuevo para intentarlo otra vez."); return; }
    reconnect();
  };
  return {
    start(wakeOnly: boolean, keepListening = false) {
      // Detach the prior end event before restarting this recognizer.
      if (mode || timer || disposed) return;
      callbacks.error(null);
      rapidEnds = 0;
      mode = wakeOnly ? "wake" : "conversation";
      continuous = keepListening;
      recognition.continuous = wakeOnly || continuous;
      begin();
    },
    stop,
    setPaused,
    dispose() {
      disposed = true;
      recognition.onstart = recognition.onresult = recognition.onerror = recognition.onend = null;
      stop();
    },
  };
}
