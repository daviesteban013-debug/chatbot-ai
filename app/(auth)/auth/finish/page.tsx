import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { provisionTenant } from "../../signup/actions";
import styles from "../../auth.module.css";

async function retry() {
  "use server";
  let ok = false;
  try { ok = (await provisionTenant()).ok; } catch { /* Show a retry without exposing server errors. */ }
  redirect(ok ? "/dashboard/jarvis" : "/auth/finish?error=setup");
}

export default async function FinishPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) redirect("/login");
  const { error } = await searchParams;
  return <div><span className={styles.eyebrow}>TU CUENTA ESTÁ VERIFICADA</span>
    <h1 className={styles.heading}>Preparar tu espacio.</h1>
    <p className={styles.description}>No pudimos completar la preparación de tu negocio. Puedes volver a intentarlo sin crear otra cuenta.</p>
    {error && <p role="alert" className={styles.error}>Todavía no pudimos conectar tu negocio. Intenta de nuevo en unos momentos.</p>}
    <form action={retry} style={{ marginTop: 24 }}><button type="submit" className={styles.primary}>Preparar y entrar a Jarvis</button></form>
  </div>;
}
