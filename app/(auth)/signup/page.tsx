import type { Metadata } from "next";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = {
  title: "Crear cuenta · NEXO",
};

export default function SignupPage() {
  return <SignupForm />;
}
