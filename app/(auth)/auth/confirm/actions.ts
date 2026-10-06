"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { provisionTenant } from "../../signup/actions";
import { callbackErrorMessage } from "@/lib/auth-messages";

export async function confirmEmail(_previous: { error: string | null }, form: FormData): Promise<{ error: string | null }> {
  const token = form.get("token_hash");
  if (typeof token !== "string" || !/^[a-zA-Z0-9_-]{16,256}$/.test(token)) return { error: "El enlace no es válido. Solicita otro correo de confirmación." };
  let destination = "/dashboard/jarvis";
  try {
    const client = await createClient();
    const { error } = await client.auth.verifyOtp({ token_hash: token, type: "email" });
    if (error) return { error: callbackErrorMessage(error.code === "otp_expired" ? "otp_expired" : "auth_callback_error") };
    try {
      if (!(await provisionTenant()).ok) destination = "/auth/finish";
    } catch { destination = "/auth/finish"; }
  } catch { return { error: "No pudimos conectar. Intenta de nuevo en unos momentos." }; }
  // A deliberate POST consumes the link, not email scanners/prefetch or a GET.
  redirect(destination);
}
