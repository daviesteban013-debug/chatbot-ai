"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { z } from "zod";
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  Loader2,
  Lock,
  Mail,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { authErrorMessage } from "@/lib/auth-messages";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { provisionTenant } from "./actions";

const signupSchema = z
  .object({
    businessName: z
      .string()
      .min(2, "Ingresa el nombre de tu negocio")
      .max(60, "Máximo 60 caracteres"),
    email: z.email("Ingresa un correo válido"),
    password: z
      .string()
      .min(8, "La contraseña debe tener al menos 8 caracteres"),
    confirmPassword: z.string().min(1, "Confirma tu contraseña"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Las contraseñas no coinciden",
    path: ["confirmPassword"],
  });

type FieldKey = "businessName" | "email" | "password" | "confirmPassword";
type FieldErrors = Partial<Record<FieldKey, string>>;

export function SignupForm() {
  const router = useRouter();
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setFieldErrors({});

    const parsed = signupSchema.safeParse({
      businessName,
      email,
      password,
      confirmPassword,
    });
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (isFieldKey(key) && !next[key]) {
          next[key] = issue.message;
        }
      }
      setFieldErrors(next);
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        data: { business_name: parsed.data.businessName },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setFormError(authErrorMessage(error.message));
      setLoading(false);
      return;
    }

    // Crear el tenant del negocio (usa service-role en el servidor).
    if (data.user) {
      await provisionTenant({
        userId: data.user.id,
        email: parsed.data.email,
        businessName: parsed.data.businessName,
      });
    }

    // Si Supabase devolvió sesión (confirmación desactivada), entrar directo.
    if (data.session) {
      router.push("/dashboard");
      router.refresh();
      return;
    }

    // Sin sesión: el usuario debe confirmar su correo antes de continuar.
    setNeedsConfirmation(true);
    setLoading(false);
  }

  if (needsConfirmation) {
    return (
      <div className="text-center">
        <span className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl border border-emerald-400/30 bg-emerald-400/10 text-emerald-400 shadow-[0_0_25px_rgba(16,185,129,0.3)]">
          <CheckCircle2 className="size-7" />
        </span>
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight text-white">
          Revisa tu correo
        </h1>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-zinc-400">
          Te enviamos un enlace de confirmación a{" "}
          <span className="font-semibold text-yellow-300">{email}</span>. Cuando lo
          actives, podrás entrar a tu panel.
        </p>
        <Link href="/login" className="mt-6 inline-block w-full">
          <button
            type="button"
            className="w-full rounded-xl bg-yellow-300 py-3 text-sm font-bold text-zinc-950 shadow-[0_0_25px_rgba(250,204,21,0.25)] transition hover:bg-yellow-200"
          >
            Ir a iniciar sesión
          </button>
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight text-white sm:text-3xl">
          Crea tu cuenta
        </h1>
        <p className="mt-1.5 text-sm text-zinc-400">
          Empieza a vender por WhatsApp con tu asistente IA.
        </p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <Field
          id="businessName"
          label="Nombre del negocio"
          error={fieldErrors.businessName}
          icon={<Building2 className="size-4 text-yellow-400/70" />}
        >
          <Input
            id="businessName"
            name="businessName"
            type="text"
            autoComplete="organization"
            placeholder="Barbería El Fade"
            className="rounded-xl border-white/10 bg-black/60 pl-10 text-white placeholder:text-zinc-500 focus:border-yellow-400 focus:ring-2 focus:ring-yellow-400/20"
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            disabled={loading}
            aria-invalid={Boolean(fieldErrors.businessName)}
          />
        </Field>

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
            autoComplete="new-password"
            placeholder="Mínimo 8 caracteres"
            className="rounded-xl border-white/10 bg-black/60 pl-10 text-white placeholder:text-zinc-500 focus:border-yellow-400 focus:ring-2 focus:ring-yellow-400/20"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
            aria-invalid={Boolean(fieldErrors.password)}
          />
        </Field>

        <Field
          id="confirmPassword"
          label="Confirmar contraseña"
          error={fieldErrors.confirmPassword}
          icon={<Lock className="size-4 text-yellow-400/70" />}
        >
          <Input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            placeholder="Repite tu contraseña"
            className="rounded-xl border-white/10 bg-black/60 pl-10 text-white placeholder:text-zinc-500 focus:border-yellow-400 focus:ring-2 focus:ring-yellow-400/20"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={loading}
            aria-invalid={Boolean(fieldErrors.confirmPassword)}
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
              <span>Creando cuenta…</span>
            </>
          ) : (
            "Crear mi cuenta"
          )}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-zinc-400">
        ¿Ya tienes cuenta?{" "}
        <Link
          href="/login"
          className="font-semibold text-yellow-300 underline decoration-yellow-400/50 decoration-2 underline-offset-4 transition hover:text-yellow-200 hover:decoration-yellow-300"
        >
          Inicia sesión
        </Link>
      </p>
    </div>
  );
}

function isFieldKey(key: unknown): key is FieldKey {
  return (
    key === "businessName" ||
    key === "email" ||
    key === "password" ||
    key === "confirmPassword"
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
