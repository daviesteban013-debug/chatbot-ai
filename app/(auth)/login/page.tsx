import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Iniciar sesión — Chatbot.ai",
};

export default async function LoginPage({
  searchParams,
}: {
  // En Next.js 16 `searchParams` es una promesa y debe esperarse.
  // Supabase reporta enlaces fallidos con `error` + `error_code`; el código
  // concreto (p. ej. `otp_expired`) da el mensaje más preciso.
  searchParams: Promise<{ error?: string; error_code?: string }>;
}) {
  const { error, error_code } = await searchParams;
  return <LoginForm callbackError={error_code ?? error} />;
}
