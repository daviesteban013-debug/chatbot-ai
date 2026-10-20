"use client";

import { useActionState, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { ArrowRight, KeyRound, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { authErrorMessage } from "@/lib/auth-messages";
import { AuthError, AuthField } from "../../auth-controls";
import { verifyRecovery } from "./actions";
import styles from "../../auth.module.css";

const passwordSchema = z.object({
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
  confirmPassword: z.string(),
}).refine(data => data.password === data.confirmPassword, { message: "Las contraseñas no coinciden", path: ["confirmPassword"] });
type FieldErrors = Partial<Record<"password" | "confirmPassword", string>>;

export function ResetForm({ email, tokenHash }: { email: string | null; tokenHash: string | null }) {
  const router = useRouter();
  const [values, setValues] = useState({ password: "", confirmPassword: "" });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [verify, verifyAction, verifying] = useActionState(verifyRecovery, { error: null });

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    setError(null); setFieldErrors({});
    const parsed = passwordSchema.safeParse(values);
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) { const key = issue.path[0]; if ((key === "password" || key === "confirmPassword") && !next[key]) next[key] = issue.message; }
      setFieldErrors(next); return;
    }
    setLoading(true);
    try {
      const { error } = await createClient().auth.updateUser({ password: parsed.data.password });
      if (error) throw error;
      router.replace("/dashboard/jarvis"); router.refresh();
    } catch (cause) { setError(authErrorMessage(cause instanceof Error ? cause.message : "")); setLoading(false); }
  }

  if (!email && tokenHash) return <div>
    <div className={styles.envelope}><KeyRound size={26} /></div>
    <span className={styles.eyebrow}>RECUPERAR ACCESO</span>
    <h1 className={styles.heading}>Crea tu contraseña nueva.</h1>
    <p className={styles.description}>Pulsa continuar para verificar el enlace de tu correo.</p>
    <form action={verifyAction} className={styles.form}>
      <input type="hidden" name="token_hash" value={tokenHash} />
      <AuthError message={verify.error} />
      <button type="submit" className={styles.primary} disabled={verifying}>{verifying ? <><Loader2 size={16} className={styles.spin} /> Verificando…</> : <>Continuar <ArrowRight size={16} /></>}</button>
    </form>
  </div>;

  if (!email) return <div>
    <span className={styles.eyebrow}>RECUPERAR ACCESO</span>
    <h1 className={styles.heading}>El enlace ya no sirve.</h1>
    <p className={styles.description}>Venció, ya se usó o se abrió en otro navegador. Pide uno nuevo y ábrelo en el mismo navegador donde lo solicitas.</p>
    <Link href="/auth/forgot" className={styles.primary}>Pedir un enlace nuevo <ArrowRight size={16} /></Link>
    <p className={styles.bottom}><Link href="/login" className={styles.link}>Volver a iniciar sesión</Link></p>
  </div>;

  return <div>
    <span className={styles.eyebrow}>RECUPERAR ACCESO</span>
    <h1 className={styles.heading}>Crea tu contraseña nueva.</h1>
    <p className={styles.description}>Para <span className={styles.email}>{email}</span>. Después entrarás directo a Zorax.</p>
    <form onSubmit={save} noValidate className={styles.form}>
      <AuthField id="password" name="password" label="Contraseña nueva" type="password" autoComplete="new-password" placeholder="Mínimo 8 caracteres" value={values.password} onChange={event => setValues(previous => ({ ...previous, password: event.target.value }))} error={fieldErrors.password} disabled={loading} autoFocus />
      <AuthField id="confirmPassword" name="confirmPassword" label="Confirmar contraseña" type="password" autoComplete="new-password" placeholder="Repite tu contraseña" value={values.confirmPassword} onChange={event => setValues(previous => ({ ...previous, confirmPassword: event.target.value }))} error={fieldErrors.confirmPassword} disabled={loading} />
      <AuthError message={error} />
      <button type="submit" className={styles.primary} disabled={loading}>{loading ? <><Loader2 size={16} className={styles.spin} /> Guardando…</> : <>Guardar y entrar <ArrowRight size={16} /></>}</button>
    </form>
  </div>;
}
