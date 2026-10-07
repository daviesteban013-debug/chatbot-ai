"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { ArrowRight, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { authErrorMessage, callbackErrorMessage } from "@/lib/auth-messages";
import { provisionTenant } from "../signup/actions";
import { AuthError, AuthField, GoogleSignIn, ResendConfirmation } from "../auth-controls";
import styles from "../auth.module.css";

const loginSchema = z.object({ email: z.email("Ingresa un correo válido"), password: z.string().min(1, "Ingresa tu contraseña") });
type FieldErrors = Partial<Record<"email" | "password", string>>;

export function LoginForm({ callbackError }: { callbackError?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(callbackError ? callbackErrorMessage(callbackError) : null);
  const [loading, setLoading] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [needsConfirmation, setNeedsConfirmation] = useState(callbackError === "otp_expired");
  const busy = loading || googleBusy;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setFormError(null); setFieldErrors({});
    const parsed = loginSchema.safeParse({ email: email.trim(), password });
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if ((key === "email" || key === "password") && !next[key]) next[key] = issue.message;
      }
      setFieldErrors(next); return;
    }
    setLoading(true);
    try {
      const { error } = await createClient().auth.signInWithPassword(parsed.data);
      if (error) { setNeedsConfirmation(error.code === "email_not_confirmed"); throw error; }
      const provisioned = await provisionTenant();
      if (!provisioned.ok) throw new Error("business_provision_failed");
      router.replace("/dashboard/jarvis"); router.refresh();
    } catch (error) { setFormError(authErrorMessage(error instanceof Error ? error.message : "")); }
    finally { setLoading(false); }
  }

  return <div>
    <span className={styles.eyebrow}>BIENVENIDO DE NUEVO</span>
    <h1 className={styles.heading}>Tu agente te espera.</h1>
    <p className={styles.description}>Entra a tu cuenta y continúa con NEXO.</p>
    <GoogleSignIn disabled={busy} onBusy={setGoogleBusy} onError={setFormError} />
    <div className={styles.divider}>o entra con tu correo</div>
    <form onSubmit={handleSubmit} noValidate className={styles.form}>
      <AuthField id="email" name="email" label="Correo electrónico" type="email" autoComplete="email" placeholder="tu@empresa.com" value={email} onChange={event => setEmail(event.target.value)} error={fieldErrors.email} disabled={busy} />
      <AuthField id="password" name="password" label="Contraseña" type="password" autoComplete="current-password" placeholder="Tu contraseña" value={password} onChange={event => setPassword(event.target.value)} error={fieldErrors.password} disabled={busy} />
      <AuthError message={formError} />
      {needsConfirmation && <ResendConfirmation email={email} />}
      <button type="submit" className={styles.primary} disabled={busy}>{loading ? <><Loader2 size={16} className={styles.spin} /> Entrando…</> : <>Entrar a NEXO <ArrowRight size={16} /></>}</button>
    </form>
    <p className={styles.bottom}>¿Primera vez aquí? <Link href="/signup" className={styles.link}>Crea tu cuenta</Link></p>
  </div>;
}
