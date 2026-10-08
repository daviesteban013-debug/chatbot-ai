"use client";

import { useEffect, useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { authErrorMessage } from "@/lib/auth-messages";
import styles from "./auth.module.css";

export function AuthField({ label, error, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string }) {
  const [show, setShow] = useState(false);
  const password = props.type === "password";
  return <div><label className={styles.label} htmlFor={props.id}>{label}</label>
    <div className={password ? styles.password : undefined}>
      <input {...props} type={password && show ? "text" : props.type} className={styles.input} aria-invalid={Boolean(error)} aria-describedby={error ? `${props.id}-error` : undefined} />
      {password && <button type="button" className={styles.showPassword} disabled={props.disabled} onClick={() => setShow(!show)} aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"}>{show ? <EyeOff size={17} /> : <Eye size={17} />}</button>}
    </div>
    {error && <p id={`${props.id}-error`} className={styles.fieldError}>{error}</p>}
  </div>;
}

export function AuthError({ message }: { message: string | null }) {
  return message ? <p className={styles.error} role="alert">{message}</p> : null;
}

export function GoogleSignIn({ disabled, onError, onBusy }: { disabled: boolean; onError: (message: string | null) => void; onBusy: (value: boolean) => void }) {
  const [loading, setLoading] = useState(false);
  async function start() {
    setLoading(true); onBusy(true); onError(null);
    try {
      const response = await fetch("/api/auth/providers", { cache: "no-store", signal: AbortSignal.timeout(7000) });
      if (!response.ok) throw new Error("Network unavailable");
      if (!(await response.json()).google) throw new Error("Provider is not enabled");
      const desktop = window.nexoDesktop;
      const { data, error } = await createClient().auth.signInWithOAuth({ provider: "google", options: {
        redirectTo: `${window.location.origin}/auth/callback${desktop ? "?desktop=1" : ""}`,
        ...(desktop ? { skipBrowserRedirect: true } : {}),
      } });
      if (error) throw error;
      if (desktop) {
        if (!data.url) throw new Error("No se pudo abrir Google");
        await desktop.startGoogleSignIn(data.url);
        setLoading(false); onBusy(false);
      }
    } catch (error) {
      onError(authErrorMessage(error instanceof Error ? error.message : ""));
      setLoading(false); onBusy(false);
    }
  }
  return <button type="button" className={styles.google} disabled={disabled || loading} onClick={start}>
    {loading ? <Loader2 size={17} className={styles.spin} /> : <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2.1H12v4h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.8 3-4.3 3-7.4Z"/><path fill="#34A853" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 .9-3.4.9a6 6 0 0 1-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.4 13.9a6 6 0 0 1 0-3.8V7.5H3.1a10 10 0 0 0 0 9l3.3-2.6Z"/><path fill="#EA4335" d="M12 6c1.5 0 2.8.5 3.8 1.5l2.8-2.8A9.5 9.5 0 0 0 12 2a10 10 0 0 0-8.9 5.5l3.3 2.6A6 6 0 0 1 12 6Z"/></svg>}
    {loading ? "Abriendo Google…" : "Continuar con Google"}
  </button>;
}

export function ResendConfirmation({ email, initiallySent = false }: { email: string; initiallySent?: boolean }) {
  const [remaining, setRemaining] = useState(initiallySent ? 60 : 0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  useEffect(() => {
    if (remaining <= 0) return;
    const timer = setTimeout(() => setRemaining(value => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [remaining]);
  async function resend() {
    setLoading(true); setError(null); setSent(false);
    try {
      const { error } = await createClient().auth.resend({ type: "signup", email: email.trim(), options: { emailRedirectTo: `${window.location.origin}/auth/callback` } });
      if (error) throw error;
      setSent(true); setRemaining(60);
    } catch (error) { setError(authErrorMessage(error instanceof Error ? error.message : "")); }
    finally { setLoading(false); }
  }
  return <div><button type="button" className={styles.textButton} onClick={resend} disabled={loading || remaining > 0 || !email.trim()}>{loading ? "Enviando…" : remaining > 0 ? `Reenviar correo en ${remaining}s` : "Reenviar correo de confirmación"}</button>
    {sent && <p role="status" className={styles.notice}>Solicitud enviada. Revisa tu bandeja de entrada y spam.</p>}
    <AuthError message={error} />
  </div>;
}
