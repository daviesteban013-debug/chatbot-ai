"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { AlertCircle, ArrowRight, Loader2, Lock, Mail, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { authErrorMessage, callbackErrorMessage } from "@/lib/auth-messages";
import { Input } from "@/components/ui/input";

const loginSchema = z.object({
  email: z.email("Ingresa un correo válido"),
  password: z.string().min(1, "Ingresa tu contraseña"),
});

type FieldErrors = Partial<Record<"email" | "password", string>>;

export function LoginForm({ callbackError }: { callbackError?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(
    callbackError ? callbackErrorMessage(callbackError) : null
  );
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setFieldErrors({});

    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if ((key === "email" || key === "password") && !next[key]) {
          next[key] = issue.message;
        }
      }
      setFieldErrors(next);
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword(parsed.data);

    if (error) {
      setFormError(authErrorMessage(error.message));
      setLoading(false);
      return;
    }

    router.replace("/dashboard/jarvis");
    router.refresh();
  }

  return (
    <div>
      <div className="mb-6">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-yellow-400/20 bg-yellow-400/5 px-2.5 py-1 text-[10px] font-mono uppercase tracking-[0.16em] text-yellow-300">
          <Sparkles className="size-3" />
          <span>Tu centro de mando</span>
        </div>
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight text-white sm:text-3xl">
          Iniciar sesión
        </h1>
        <p className="mt-1.5 text-sm text-zinc-400">
          Vuelve a Jarvis. Tu agente y tu negocio, en un mismo lugar.
        </p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <Field
          id="email"
          label="Correo electrónico"
          error={fieldErrors.email}
          icon={<Mail className="size-4 text-yellow-400/70" />}
        >
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="tu@empresa.com"
            className="rounded-xl border-white/10 bg-black/60 pl-10 text-white placeholder:text-zinc-500 focus:border-yellow-400 focus:ring-2 focus:ring-yellow-400/20"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
            aria-invalid={Boolean(fieldErrors.email)}
          />
        </Field>

        <Field
          id="password"
          label="Contraseña"
          error={fieldErrors.password}
          icon={<Lock className="size-4 text-yellow-400/70" />}
        >
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            className="rounded-xl border-white/10 bg-black/60 pl-10 text-white placeholder:text-zinc-500 focus:border-yellow-400 focus:ring-2 focus:ring-yellow-400/20"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
            aria-invalid={Boolean(fieldErrors.password)}
          />
        </Field>

        {formError ? (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-950/40 p-3 text-sm text-rose-300 backdrop-blur-md"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0 text-rose-400" />
            {formError}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={loading}
          className="group relative flex w-full min-h-12 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-yellow-300 via-amber-300 to-yellow-400 px-6 py-3.5 text-sm font-bold text-zinc-950 shadow-[0_0_25px_rgba(250,204,21,0.25)] transition duration-200 hover:scale-[1.01] hover:shadow-[0_0_35px_rgba(250,204,21,0.4)] disabled:opacity-50 disabled:pointer-events-none"
        >
          {loading ? (
            <>
              <Loader2 className="size-4 animate-spin text-zinc-950" />
              <span>Conectando al sistema…</span>
            </>
          ) : (
            <>
              <span>Entrar a Jarvis</span>
              <ArrowRight className="size-4 transition duration-200 group-hover:translate-x-1" />
            </>
          )}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-zinc-400">
        ¿Aún no tienes cuenta?{" "}
        <Link
          href="/signup"
          className="font-semibold text-yellow-300 underline decoration-yellow-400/50 decoration-2 underline-offset-4 transition hover:text-yellow-200 hover:decoration-yellow-300"
        >
          Regístrate gratis
        </Link>
      </p>
    </div>
  );
}

/** Campo con etiqueta, icono adornado y mensaje de error. */
function Field({
  id,
  label,
  icon,
  error,
  children,
}: {
  id: string;
  label: string;
  icon: ReactNode;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1.5 block text-xs font-mono font-medium uppercase tracking-wider text-zinc-300"
      >
        {label}
      </label>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
          {icon}
        </span>
        {children}
      </div>
      {error ? (
        <p className="mt-1.5 text-xs font-medium text-rose-400">{error}</p>
      ) : null}
    </div>
  );
}
