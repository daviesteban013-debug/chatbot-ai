import { createClient } from "@/lib/supabase/server";
import { sanitizePersonalization, spokenText } from "@/lib/jarvis-personalization";
import { MAX_SPEECH_CHARACTERS, elevenLabsSettings } from "@/lib/jarvis-voice";
import { elevenLabsConfig } from "@/lib/voice/elevenlabs";
import { createSpeechBudget } from "@/lib/voice/speech-budget";

export const runtime = "nodejs";
export const maxDuration = 60;
const reserve = createSpeechBudget();
const privateHeaders = { "Cache-Control": "private, no-store", "Vary": "Cookie", "X-Content-Type-Options": "nosniff" };
const fail = (status: number, error: string) => Response.json({ error }, { status, headers: privateHeaders });

async function readBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("body");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 32_000) { await reader.cancel(); throw new Error("body"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const data = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(data));
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return fail(403, "La solicitud de voz debe venir de Jarvis.");
  let user;
  try {
    const supabase = await createClient();
    const result = await supabase.auth.getUser();
    user = result.error ? null : result.data.user;
  } catch { return fail(503, "No se pudo comprobar tu sesión. Vuelve a intentarlo."); }
  if (!user || user.is_anonymous) return fail(401, "Inicia sesión para usar ElevenLabs.");
  const config = elevenLabsConfig();
  if (!config) return fail(503, "ElevenLabs aún no está conectado. Puedes elegir Voz del dispositivo en Personalización.");
  let body;
  try { body = await readBody(request); } catch { return fail(400, "La solicitud de voz no es válida."); }
  if (!body || typeof body.text !== "string" || !body.text.trim() || body.text.length > MAX_SPEECH_CHARACTERS) {
    return fail(400, `La voz admite hasta ${MAX_SPEECH_CHARACTERS} caracteres por respuesta. El texto completo sigue en el chat.`);
  }
  const text = spokenText(body.text);
  if (!text) return fail(400, "No hay texto para leer.");
  const profile = sanitizePersonalization({ voice: body.voice });
  const tone = ["profesional", "divertido", "directo"].includes(body.tone) ? body.tone : "cercano";
  const release = reserve(user.id, text.length);
  if (!release) return fail(429, "Espera unos segundos antes de pedir más audio.");
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(45_000)]);
  try {
    const upstream = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${config.voiceId}/stream?output_format=mp3_44100_128`, {
      method: "POST", cache: "no-store", signal,
      headers: { "xi-api-key": config.apiKey, "Content-Type": "application/json", "Accept": "audio/mpeg" },
      body: JSON.stringify({ text, model_id: config.model, voice_settings: elevenLabsSettings(profile, tone, text), ...(config.model === "eleven_flash_v2_5" ? { language_code: "es" } : {}) }),
    });
    if (!upstream.ok || !upstream.body || !upstream.headers.get("content-type")?.startsWith("audio/")) {
      await upstream.body?.cancel(); release();
      if (upstream.status === 401 || upstream.status === 403) return fail(502, "ElevenLabs rechazó el acceso. Revisa la clave y sus permisos.");
      if (upstream.status === 402) return fail(402, "ElevenLabs requiere un plan de pago para esta solicitud. Revisa tu plan y la voz elegida, o usa Voz del dispositivo.");
      if (upstream.status === 429) return fail(429, "ElevenLabs alcanzó su cuota o límite. Inténtalo más tarde o usa Voz del dispositivo.");
      return fail(502, "ElevenLabs no pudo generar la voz. Revisa la voz elegida y la disponibilidad del servicio.");
    }
    const reader = upstream.body.getReader();
    const audio = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const chunk = await reader.read();
          if (chunk.done) { release(); reader.releaseLock(); controller.close(); }
          else controller.enqueue(chunk.value);
        } catch { release(); controller.error(new Error("La generación de voz se interrumpió.")); }
      },
      async cancel() { release(); await reader.cancel().catch(() => {}); },
    });
    return new Response(audio, { headers: { ...privateHeaders, "Content-Type": "audio/mpeg" } });
  } catch {
    release();
    return fail(signal.aborted ? 504 : 502, "No se pudo completar el audio de ElevenLabs. Inténtalo de nuevo.");
  }
}
