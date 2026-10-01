import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Iniciar sesión — Chatbot.ai",
};

export default async function LoginPage({
  searchParams,
}: {
  // En Next.js 16 `searchParams` es una promesa y debe esperarse.
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return <LoginForm callbackError={error} />;
}
