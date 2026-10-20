import type { Metadata } from "next";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = {
  title: "Crear cuenta · Zorax",
};

export default function SignupPage() {
  return <SignupForm />;
}
