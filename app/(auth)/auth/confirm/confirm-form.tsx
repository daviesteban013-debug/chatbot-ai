"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Mail, Loader2, ArrowRight } from "lucide-react";
import { AuthError } from "../../auth-controls";
import { confirmEmail } from "./actions";
import styles from "../../auth.module.css";

export function ConfirmForm({ tokenHash }: { tokenHash: string | null }) {
  const [state, action, pending] = useActionState(confirmEmail, { error: null });
  return <div>
    <div className={styles.envelope}><Mail size={28} /></div>
    <span className={styles.eyebrow}>TU CUENTA, LISTA PARA EMPEZAR</span>
    <h1 className={styles.heading}>Un clic y estás dentro.</h1>
    <p className={styles.description}>Confirma tu correo para conocer a NEXO y empezar con tu negocio.</p>
    {tokenHash ? <form action={action} className={styles.form}>
      <input type="hidden" name="token_hash" value={tokenHash} />
      <AuthError message={state.error} />
      <button type="submit" className={styles.primary} disabled={pending}>{pending ? <><Loader2 size={16} className={styles.spin} /> Confirmando…</> : <>Confirmar y entrar a NEXO <ArrowRight size={16} /></>}</button>
    </form> : <AuthError message="El enlace está incompleto. Solicita otro correo de confirmación desde el inicio de sesión." />}
    <p className={styles.bottom}><Link href="/login?error=otp_expired" className={styles.link}>Volver al inicio de sesión</Link></p>
  </div>;
}
