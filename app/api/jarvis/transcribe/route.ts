import { createClient } from "@/lib/supabase/server";
import { createSpeechBudget } from "@/lib/voice/speech-budget";
import { createTranscriptionHandler } from "@/lib/voice/transcription";
export const runtime = "nodejs";
export const maxDuration = 30;
export const POST = createTranscriptionHandler({
  user: async () => {
    const supabase = await createClient();
    const result = await supabase.auth.getUser();
    return result.error ? null : result.data.user;
  },
  key: () => process.env.OPENAI_API_KEY,
  reserve: createSpeechBudget(),
  fetch: (...args) => fetch(...args),
});
