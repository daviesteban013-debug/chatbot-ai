"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { ArrowRight, Loader2, Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { authErrorMessage } from "@/lib/auth-messages";
import { provisionTenant } from "./actions";
import { AuthError, AuthField, GoogleSignIn, ResendConfirmation } from "../auth-controls";
import styles from "../auth.module.css";

const signupSchema = z.object({
  businessName: z.string().trim().min(2, "Ingresa el nombre de tu negocio").max(60, "Máximo 60 caracteres"),
  email: z.email("Ingresa un correo válido"),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
  confirmPassword: z.string().min(1, "Confirma tu contraseña"),
}).refine(data => data.password === data.confirmPassword, { message: "Las contraseñas no coinciden", path: ["confirmPassword"] });
type FieldKey = "businessName" | "email" | "password" | "confirmPassword";

export function SignupForm() {
  const router = useRouter();
  const [values, setValues] = useState({ businessName: "", email: "", password: "", confirmPassword: "" });
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const busy = loading || googleBusy;
  const change = (key: FieldKey, value: string) => setValues(previous => ({ ...previous, [key]: value }));

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setFormError(null); setFieldErrors({});
    const parsed = signupSchema.safeParse({ ...values, email: values.email.trim() });
    if (!parsed.success) {
      const next: Partial<Record<FieldKey, string>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (key === "businessName" || key === "email" || key === "password" || key === "confirmPassword") next[key] ??= issue.message;
      }
      setFieldErrors(next); return;
    }
    setLoading(true);
    try {
      const { data, error } = await createClient().auth.signUp({ email: parsed.data.email, password: parsed.data.password, options: {
        data: { business_name: parsed.data.businessName }, emailRedirectTo: `${window.location.origin}/auth/callback`,
      } });
      if (error) throw error;
      if (data.session) {
        const provisioned = await provisionTenant();
        if (!provisioned.ok) throw new Error("business_provision_failed");
        router.replace("/dashboard/jarvis"); router.refresh(); return;
      }
      // No service-role writes until the user has verified their email and owns a session.
      setValues(previous => ({ ...previous, email: parsed.data.email, password: "", confirmPassword: "" }));
      setNeedsConfirmation(true);
    } catch (error) { setFormError(authErrorMessage(error instanceof Error ? error.message : "")); }
    finally { setLoading(false); }
  }

  if (needsConfirmation) return <div>
    <div className={styles.envelope}><Mail size={28} /></div>
    <span className={styles.eyebrow}>UN ÚLTIMO PASO</span>
    <h1 className={styles.heading}>Confirma tu correo.</h1>
    <p className={styles.description}>Revisa <strong className={styles.email}>{values.email}</strong> y abre el enlace para entrar a NEXO. Si ya tienes una cuenta, inicia sesión.</p>
    <p className={styles.description}>¿No aparece? Revisa spam o solicita otro correo.</p>
    <ResendConfirmation email={values.email} initiallySent />
    <Link href="/login" className={styles.primary} style={{ marginTop: 24 }}>Ir a iniciar sesión <ArrowRight size={16} /></Link>
    <p className={styles.bottom}><button type="button" className={styles.textButton} onClick={() => { setNeedsConfirmation(false); setFormError(null); }}>Usar otro correo</button></p>
  </div>;

  return <div>
    <span className={styles.eyebrow}>EMPECEMOS ALGO GRANDE</span>
    <h1 className={styles.heading}>Conoce a tu NEXO.</h1>
    <p className={styles.description}>Crea tu cuenta. Tu agente será lo primero que verás.</p>
    <GoogleSignIn disabled={busy} onBusy={setGoogleBusy} onError={setFormError} />
    <div className={styles.divider}>o regístrate con tu correo</div>
    <form onSubmit={handleSubmit} noValidate className={styles.form}>
      <AuthField id="businessName" name="businessName" label="Nombre de tu negocio" type="text" autoComplete="organization" placeholder="Tu negocio" value={values.businessName} onChange={e => change("businessName", e.target.value)} error={fieldErrors.businessName} disabled={busy} maxLength={60} />
      <AuthField id="email" name="email" label="Correo electrónico" type="email" autoComplete="email" placeholder="tu@empresa.com" value={values.email} onChange={e => change("email", e.target.value)} error={fieldErrors.email} disabled={busy} />
      <AuthField id="password" name="password" label="Contraseña" type="password" autoComplete="new-password" placeholder="Mínimo 8 caracteres" value={values.password} onChange={e => change("password", e.target.value)} error={fieldErrors.password} disabled={busy} />
      <AuthField id="confirmPassword" name="confirmPassword" label="Confirmar contraseña" type="password" autoComplete="new-password" placeholder="Repite tu contraseña" value={values.confirmPassword} onChange={e => change("confirmPassword", e.target.value)} error={fieldErrors.confirmPassword} disabled={busy} />
      <AuthError message={formError} />
      <button type="submit" disabled={busy} className={styles.primary}>{loading ? <><Loader2 size={16} className={styles.spin} /> Creando cuenta…</> : <>Crear mi cuenta <ArrowRight size={16} /></>}</button>
    </form>
    <p className={styles.bottom}>¿Ya tienes cuenta? <Link href="/login" className={styles.link}>Inicia sesión</Link></p>
  </div>;
}
