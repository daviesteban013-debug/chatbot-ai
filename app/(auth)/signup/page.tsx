import type { Metadata } from "next";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = {
  title: "Crear cuenta — Chatbot.ai",
};

export default function SignupPage() {
  return <SignupForm />;
}
