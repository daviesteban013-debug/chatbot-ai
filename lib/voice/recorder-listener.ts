import { createVoiceActivity } from "@/lib/voice/voice-activity";
export function createRecorderListener(locale: string, callbacks: {
  listening: (value: boolean) => void;
  error: (message: string | null) => void;
  transcript: (text: string, wakeOnly: boolean) => boolean;
}) {
  let armed = false, paused = false, disposed = false, wakeOnly = false, continuous = false, generation = 0;
  let stream: MediaStream | null = null, context: AudioContext | null = null, timer: ReturnType<typeof setInterval> | null = null;
  let recorder: MediaRecorder | null = null, upload: AbortController | null = null, processing = false;
  const gate = createVoiceActivity();
  function discard() {
    if (recorder) { recorder.ondataavailable = recorder.onstop = recorder.onerror = null; if (recorder.state !== "inactive") recorder.stop(); recorder = null; }
    gate.reset(); upload?.abort(); upload = null; processing = false;
  }
  function setPaused(value: boolean) {
    paused = value;
    if (value && stream) { generation++; discard(); }
    stream?.getAudioTracks().forEach(track => { track.enabled = !value; });
    callbacks.listening(Boolean(armed && stream && !value));
  }
  function stop() {
    armed = false; generation++; discard();
    if (timer) clearInterval(timer);
    timer = null; stream?.getTracks().forEach(track => track.stop()); stream = null;
    void context?.close().catch(() => {}); context = null;
    callbacks.listening(false);
  }
  async function start(wake: boolean, keepListening = false) {
    if (armed || disposed) return;
    armed = true; wakeOnly = wake; continuous = keepListening; callbacks.error(null);
    const mine = ++generation;
    try {
      const capture = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
      if (!armed || disposed || mine !== generation) { capture.getTracks().forEach(track => track.stop()); return; }
      stream = capture;
      context = new AudioContext(); await context.resume();
      if (!armed || disposed) return;
      const analyser = context.createAnalyser(); analyser.fftSize = 1024;
      context.createMediaStreamSource(capture).connect(analyser);
      const samples = new Float32Array(analyser.fftSize);
      const mime = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4"].find(type => MediaRecorder.isTypeSupported(type));
      if (!mime) throw new Error("Este dispositivo no ofrece grabación de voz compatible.");
      setPaused(paused);
      timer = setInterval(() => {
        if (!armed || paused || processing || !stream) return;
        analyser.getFloatTimeDomainData(samples);
        const rms = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
        const now = performance.now(), action = gate.sample(rms, now);
        if (action === "start") {
          const current = new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 64_000 });
          const chunks: Blob[] = [], turn = generation;
          let valid = false, duration = 0;
          recorder = current;
          current.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
          current.onstop = async () => {
            recorder = null;
            if (!valid || !armed || paused || disposed || turn !== generation) { processing = false; return; }
            processing = true; callbacks.listening(false);
            const controller = new AbortController(); upload = controller;
            try {
              const blob = new Blob(chunks, { type: mime });
              if (blob.size > 200_000) throw new Error("La frase es demasiado larga. Prueba con una más corta.");
              const body = new FormData(); body.set("audio", blob, "voice"); body.set("duration", String(duration)); body.set("language", locale);
              const response = await fetch("/api/jarvis/transcribe", { method: "POST", body, credentials: "same-origin", cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(25_000)]) });
              const data = await response.json();
              if (!response.ok) throw new Error(data.error || "No se pudo reconocer tu voz.");
              if (turn !== generation || !armed || paused || disposed) return;
              const accepted = typeof data.text === "string" && !!data.text && callbacks.transcript(data.text, wakeOnly);
              if (accepted && !continuous) stop();
              // The hook pauses while NEXO is thinking/speaking; panel commands can keep listening.
            } catch (error) {
              if (!controller.signal.aborted && turn === generation && armed) {
                stop(); callbacks.error(error instanceof Error ? error.message : "La escucha se interrumpió.");
              }
            } finally {
              if (turn === generation) { processing = false; upload = null; callbacks.listening(Boolean(armed && !paused)); }
            }
          };
          current.onerror = () => { stop(); callbacks.error("No se pudo grabar el micrófono."); };
          current.start();
          // Store the gate result before stopping; onstop is asynchronous.
          const finish = () => { valid = gate.valid(); duration = gate.duration(performance.now()); gate.reset(); processing = true; current.stop(); };
          (current as MediaRecorder & { finish?: () => void }).finish = finish;
        } else if (action === "finish" && recorder) {
          (recorder as MediaRecorder & { finish?: () => void }).finish?.();
        }
      }, 35);
    } catch (error) {
      if (!armed || disposed) return;
      stop(); callbacks.error(error instanceof DOMException && error.name === "NotAllowedError" ? "Permite el micrófono para hablar con NEXO." : error instanceof Error ? error.message : "No se pudo activar el micrófono.");
    }
  }
  return { start, stop, setPaused, dispose() { disposed = true; stop(); } };
}
