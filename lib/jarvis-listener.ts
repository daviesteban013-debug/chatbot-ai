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

/** Browser recognition lifetime. No automatic mic start, including after errors. */
export function createJarvisListener(recognition: Recognition, callbacks: {
  listening: (value: boolean) => void;
  error: (message: string | null) => void;
  transcript: (text: string, wakeOnly: boolean) => boolean;
}) {
  let mode: "wake" | "conversation" | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let rapidEnds = 0;
  let startedAt = 0;
  const stop = () => {
    mode = null;
    if (timer) clearTimeout(timer);
    timer = null;
    recognition.abort();
    callbacks.listening(false);
  };
  const begin = () => {
    startedAt = Date.now();
    try { recognition.start(); }
    catch { stop(); callbacks.error("No se pudo iniciar el micrófono. Vuelve a pulsar el botón."); }
  };
  recognition.interimResults = false;
  recognition.onstart = () => { if (mode) callbacks.listening(true); };
  recognition.onresult = event => {
    if (!mode) return;
    for (let index = event.resultIndex; index < event.results.length; index++) {
      const result = event.results[index];
      if (!result.isFinal) continue;
      const text = result[0]?.transcript.trim();
      if (text && callbacks.transcript(text, mode === "wake")) { stop(); break; }
    }
  };
  recognition.onerror = event => {
    if (!mode || event.error === "no-speech") return;
    stop();
    callbacks.error(event.error === "not-allowed" || event.error === "service-not-allowed"
      ? "Permite el micrófono en tu navegador o usa Encender Jarvis y el chat."
      : "La escucha se detuvo. Puedes reactivarla o seguir por escrito.");
  };
  recognition.onend = () => {
    callbacks.listening(false);
    if (mode !== "wake") { mode = null; return; }
    rapidEnds = Date.now() - startedAt < 1000 ? rapidEnds + 1 : 0;
    if (rapidEnds >= 3) { stop(); callbacks.error("El navegador detuvo la escucha. Pulsa Activar comando de voz para intentarlo otra vez."); return; }
    // Only a user-armed wake listener can reconnect after normal silence.
    timer = setTimeout(() => { timer = null; if (mode === "wake") begin(); }, 350);
  };
  return {
    start(wakeOnly: boolean) {
      // Detach the prior end event before restarting this recognizer.
      if (mode || timer) return;
      callbacks.error(null);
      rapidEnds = 0;
      mode = wakeOnly ? "wake" : "conversation";
      recognition.continuous = wakeOnly;
      begin();
    },
    stop,
    dispose() {
      recognition.onstart = recognition.onresult = recognition.onerror = recognition.onend = null;
      stop();
    },
  };
}
