const MAX_BODY = 210_000;
const privateHeaders = { "Cache-Control": "private, no-store", "Vary": "Cookie", "X-Content-Type-Options": "nosniff" };
const fail = (status: number, error: string) => Response.json({ error }, { status, headers: privateHeaders });
interface Dependencies {
  user: () => Promise<{ id: string; is_anonymous?: boolean } | null>;
  key: () => string | undefined;
  reserve: (id: string, units: number) => (() => void) | null;
  fetch: typeof fetch;
}
export function createTranscriptionHandler(deps: Dependencies) {
  return async (request: Request) => {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) return fail(403, "La escucha debe iniciarse desde NEXO.");
    let user;
    try { user = await deps.user(); } catch { return fail(503, "No se pudo comprobar tu sesión."); }
    if (!user || user.is_anonymous) return fail(401, "Inicia sesión para hablar con NEXO.");
    const key = deps.key();
    if (!key) return fail(503, "La transcripción de voz aún no está conectada.");
    const declared = Number(request.headers.get("content-length"));
    if (declared > MAX_BODY) return fail(413, "El audio es demasiado largo. Usa frases de hasta 12 segundos.");
    if (!request.headers.get("content-type")?.startsWith("multipart/form-data;")) return fail(400, "El formato de audio no es válido.");
    let form;
    try {
      const reader = request.body?.getReader();
      if (!reader) throw new Error();
      let length = 0;
      const chunks: Uint8Array[] = [];
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          length += value.byteLength;
          if (length > MAX_BODY) { await reader.cancel(); return fail(413, "El audio es demasiado largo."); }
          chunks.push(value);
        }
      } finally { reader.releaseLock(); }
      const bytes = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      form = await new Response(bytes, { headers: { "Content-Type": request.headers.get("content-type")! } }).formData();
    } catch { return fail(400, "No se pudo leer el audio."); }
    const file = form.get("audio");
    const duration = Number(form.get("duration"));
    if (!(file instanceof File) || file.size < 100 || file.size > 200_000 || !["audio/webm", "audio/ogg", "audio/mp4"].includes(file.type.split(";")[0]) || !Number.isFinite(duration) || duration < 250 || duration > 12_500) return fail(400, "Envía una frase de voz de hasta 12 segundos.");
    const release = deps.reserve(user.id, 500);
    if (!release) return fail(429, "Espera unos segundos antes de continuar hablando.");
    const language = String(form.get("language") || "es").split("-")[0];
    const body = new FormData();
    body.set("file", file, file.type.startsWith("audio/mp4") ? "voice.m4a" : file.type.startsWith("audio/ogg") ? "voice.ogg" : "voice.webm");
    body.set("model", "gpt-4o-mini-transcribe");
    if (/^[a-z]{2}$/.test(language)) body.set("language", language);
    // A short hint helps the recognizer with the brand and CRM vocabulary.
    body.set("prompt", "Conversación en español con NEXO, un agente de CRM. Comandos habituales: NEXO, abre pedidos. Abre catálogo. Abre conversaciones. Abre aprobaciones. Abre planes y pagos. NEXO, enciéndete. NEXO, apágate.");
    try {
      const response = await deps.fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST", headers: { Authorization: `Bearer ${key}` }, body, cache: "no-store",
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(20_000)]),
      });
      if (!response.ok) {
        await response.body?.cancel();
        return fail(response.status === 429 ? 429 : 502, response.status === 429 ? "La API de voz alcanzó su cuota. Revisa el saldo o inténtalo más tarde." : "No se pudo reconocer tu voz. Vuelve a intentarlo.");
      }
      const data = await response.json();
      if (typeof data.text !== "string" || data.text.length > 4000) return fail(502, "El servicio devolvió una transcripción no válida.");
      return Response.json({ text: data.text.trim() }, { headers: privateHeaders });
    } catch { return fail(502, "No se pudo conectar el reconocimiento de voz."); }
    finally { release(); }
  };
}
