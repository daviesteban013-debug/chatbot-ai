"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { callbackErrorMessage } from "@/lib/auth-messages";

/** Recovery links in token form work on any device; a deliberate POST consumes them, never a scanner's GET. */
export async function verifyRecovery(_previous: { error: string | null }, form: FormData): Promise<{ error: string | null }> {
  const token = form.get("token_hash");
  if (typeof token !== "string" || !/^[a-zA-Z0-9_-]{16,256}$/.test(token)) return { error: "El enlace no es válido. Pide uno nuevo." };
  try {
    const { error } = await (await createClient()).auth.verifyOtp({ token_hash: token, type: "recovery" });
    if (error) return { error: callbackErrorMessage(error.code === "otp_expired" ? "otp_expired" : "auth_callback_error") };
  } catch { return { error: "No pudimos conectar. Intenta de nuevo en unos momentos." }; }
  redirect("/auth/reset");
}
