"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { ArrowRight, KeyRound, Loader2, Mail, UserCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { rememberLoginEmail } from "@/lib/auth-handoff";
import { authErrorMessage } from "@/lib/auth-messages";
import { provisionTenant } from "./actions";
import { LaunchCurtain } from "./launch-curtain";
import { AuthError, AuthField, GoogleSignIn, ResendConfirmation } from "../auth-controls";
import styles from "../auth.module.css";

/** The curtain stays up at least this long, so its two lines can be read before the portal opens. */
const LAUNCH_MIN_MS = 1900;

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
  // The e-mail already has an account and the typed password did not open it (wrong, or the e-mail is still unconfirmed).
  const [existing, setExisting] = useState<"password" | "unconfirmed" | null>(null);
  const [launching, setLaunching] = useState(false);
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
      const client = createClient();
      const credentials = { email: parsed.data.email, password: parsed.data.password };
      const { data, error } = await client.auth.signUp({ ...credentials, options: {
        data: { business_name: parsed.data.businessName }, emailRedirectTo: `${window.location.origin}/auth/callback`,
      } });
      // An e-mail that already has an account comes back as an error (auto-confirm) or as a user without
      // identities (confirmations on). That is a sign-in, not a new account: the typed password decides.
      const taken = error ? /already (?:been )?registered/i.test(error.message) : Boolean(data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0);
      if (taken) {
        const signedIn = await client.auth.signInWithPassword(credentials);
        if (!signedIn.error) {
          const provisioned = await provisionTenant();
          if (!provisioned.ok) throw new Error("business_provision_failed");
          router.replace("/dashboard/jarvis"); router.refresh(); return;
        }
        rememberLoginEmail(parsed.data.email);
        setValues(previous => ({ ...previous, email: parsed.data.email, password: "", confirmPassword: "" }));
        setExisting(signedIn.error.code === "email_not_confirmed" ? "unconfirmed" : "password");
        return;
      }
      if (error) throw error;
      if (data.session) {
        // The account exists: the curtain goes up while the business is created, then the welcome portal.
        setLaunching(true);
        const [provisioned] = await Promise.all([provisionTenant(), new Promise(resolve => setTimeout(resolve, LAUNCH_MIN_MS))]);
        if (!provisioned.ok) { setLaunching(false); throw new Error("business_provision_failed"); }
        router.replace("/onboarding"); router.refresh(); return;
      }
      // No service-role writes until the user has verified their email and owns a session.
      setValues(previous => ({ ...previous, email: parsed.data.email, password: "", confirmPassword: "" }));
      setNeedsConfirmation(true);
    } catch (error) { setFormError(authErrorMessage(error instanceof Error ? error.message : "")); }
    finally { setLoading(false); }
  }

  if (existing) return <div>
    <div className={styles.envelope}>{existing === "unconfirmed" ? <Mail size={28} /> : <UserCheck size={28} />}</div>
    <span className={styles.eyebrow}>YA NOS CONOCEMOS</span>
    <h1 className={styles.heading}>{existing === "unconfirmed" ? "Tu cuenta existe; falta confirmar el correo." : "Este correo ya tiene cuenta."}</h1>
    {existing === "unconfirmed" ? <>
      <p className={styles.description}><strong className={styles.email}>{values.email}</strong> ya está registrado en NEXO, pero aún no abriste el enlace de confirmación. Te enviamos uno nuevo.</p>
      <ResendConfirmation email={values.email} initiallySent />
    </> : <>
      <p className={styles.description}><strong className={styles.email}>{values.email}</strong> ya está en NEXO. No hace falta crear otra cuenta: entra con tu contraseña o recupérala.</p>
      <Link href="/login" className={styles.primary}>Iniciar sesión <ArrowRight size={16} /></Link>
      <Link href="/auth/forgot" className={styles.secondary} style={{ marginTop: 10 }}><KeyRound size={16} /> Recuperar mi contraseña</Link>
    </>}
    <p className={styles.bottom}><button type="button" className={styles.textButton} onClick={() => { setExisting(null); setFormError(null); }}>Usar otro correo</button></p>
  </div>;

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
    {launching && <LaunchCurtain />}
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
