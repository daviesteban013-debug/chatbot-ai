"use client";

import { useEffect, useState, useSyncExternalStore, type FormEvent } from "react";
import Link from "next/link";
import { z } from "zod";
import { ArrowLeft, Loader2, MailCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { authErrorMessage } from "@/lib/auth-messages";
import { AuthError, AuthField } from "../../auth-controls";
import styles from "../../auth.module.css";

const emailSchema = z.email("Ingresa un correo válido");
const subscribe = () => () => {};
const WEB_URL = "chatbot-ai-gold-two.vercel.app/auth/forgot";

/** Sends a recovery link. The answer never reveals whether an account exists. */
export function ForgotForm() {
  const desktop = useSyncExternalStore(subscribe, () => Boolean(window.nexoDesktop), () => false);
  const [email, setEmail] = useState("");
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [wait, setWait] = useState(0);
  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setWait(value => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  async function send(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (loading || wait > 0) return;
    setError(null); setFieldError(undefined);
    const parsed = emailSchema.safeParse(email.trim());
    if (!parsed.success) { setFieldError(parsed.error.issues[0]?.message); return; }
    setLoading(true);
    try {
      const { error } = await createClient().auth.resetPasswordForEmail(parsed.data, { redirectTo: `${window.location.origin}/auth/callback?next=/auth/reset` });
      if (error) throw error;
      setSentTo(parsed.data); setWait(60);
    } catch (cause) { setError(authErrorMessage(cause instanceof Error ? cause.message : "")); }
    finally { setLoading(false); }
  }

  if (desktop) return <div>
    <span className={styles.eyebrow}>RECUPERAR ACCESO</span>
    <h1 className={styles.heading}>Hazlo desde tu navegador.</h1>
    <p className={styles.description}>El enlace de recuperación debe abrirse en el mismo navegador donde lo pides. Abre esta dirección en Chrome, Edge o Safari, crea tu contraseña nueva y vuelve a entrar aquí.</p>
    <p className={styles.code}>{WEB_URL}</p>
    <Link href="/login" className={styles.secondary}><ArrowLeft size={15} /> Volver a iniciar sesión</Link>
  </div>;

  if (sentTo) return <div>
    <div className={styles.envelope}><MailCheck size={26} /></div>
    <span className={styles.eyebrow}>REVISA TU CORREO</span>
    <h1 className={styles.heading}>Te enviamos un enlace.</h1>
    <p className={styles.description}>Si hay una cuenta con <span className={styles.email}>{sentTo}</span>, recibirás un enlace para crear una contraseña nueva. Ábrelo en este mismo navegador; vence en 1 hora. Revisa también spam.</p>
    <AuthError message={error} />
    <button type="button" className={styles.secondary} disabled={loading || wait > 0} onClick={() => void send()}>{loading ? <><Loader2 size={15} className={styles.spin} /> Enviando…</> : wait > 0 ? `Reenviar en ${wait}s` : "Reenviar enlace"}</button>
    <p className={styles.bottom}><Link href="/login" className={styles.link}>Volver a iniciar sesión</Link></p>
  </div>;

  return <div>
    <span className={styles.eyebrow}>RECUPERAR ACCESO</span>
    <h1 className={styles.heading}>¿Olvidaste tu contraseña?</h1>
    <p className={styles.description}>Escribe el correo de tu cuenta y te enviamos un enlace para crear una nueva.</p>
    <form onSubmit={send} noValidate className={styles.form}>
      <AuthField id="email" name="email" label="Correo electrónico" type="email" autoComplete="email" placeholder="tu@empresa.com" value={email} onChange={event => setEmail(event.target.value)} error={fieldError} disabled={loading} autoFocus />
      <AuthError message={error} />
      <button type="submit" className={styles.primary} disabled={loading}>{loading ? <><Loader2 size={16} className={styles.spin} /> Enviando…</> : "Enviar enlace"}</button>
    </form>
    <p className={styles.bottom}>¿La recordaste? <Link href="/login" className={styles.link}>Inicia sesión</Link></p>
  </div>;
}
