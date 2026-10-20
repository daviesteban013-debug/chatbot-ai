import type { Metadata } from "next";
import { ForgotForm } from "./forgot-form";

export const metadata: Metadata = { title: "Recuperar contraseña · Zorax", robots: { index: false, follow: false } };

export default function ForgotPage() {
  return <ForgotForm />;
}
