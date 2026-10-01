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
        <span className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
          <CheckCircle2 className="size-7" />
        </span>
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight text-slate-950">
          Revisa tu correo
        </h1>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-500">
          Te enviamos un enlace de confirmación a{" "}
          <span className="font-medium text-slate-700">{email}</span>. Cuando lo
          actives, podrás entrar a tu panel.
        </p>
        <Link href="/login" className="mt-6 inline-block">
          <Button type="button" size="lg" className="w-full bg-slate-950 hover:bg-slate-800 sm:w-auto">
            Ir a iniciar sesión
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight text-slate-950">
          Crea tu cuenta
        </h1>
        <p className="mt-1.5 text-sm text-slate-500">
          Empieza a vender por WhatsApp con tu asistente IA.
        </p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <Field
          id="businessName"
          label="Nombre del negocio"
          error={fieldErrors.businessName}
          icon={<Building2 className="size-4 text-slate-400" />}
        >
          <Input
            id="businessName"
            name="businessName"
            type="text"
            autoComplete="organization"
            placeholder="Barbería El Fade"
            className="pl-10"
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
          icon={<Mail className="size-4 text-slate-400" />}
        >
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="tu@empresa.com"
            className="pl-10"
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
          icon={<Lock className="size-4 text-slate-400" />}
        >
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            placeholder="Mínimo 8 caracteres"
            className="pl-10"
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
          icon={<Lock className="size-4 text-slate-400" />}
        >
          <Input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            placeholder="Repite tu contraseña"
            className="pl-10"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={loading}
            aria-invalid={Boolean(fieldErrors.confirmPassword)}
          />
        </Field>

        {formError ? (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            {formError}
          </p>
        ) : null}

        <Button
          type="submit"
          size="lg"
          disabled={loading}
          className="w-full bg-slate-950 text-white hover:bg-slate-800"
        >
          {loading ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Creando cuenta…
            </>
          ) : (
            "Crear cuenta"
          )}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-500">
        ¿Ya tienes cuenta?{" "}
        <Link
          href="/login"
          className="font-semibold text-slate-950 underline decoration-yellow-400 decoration-2 underline-offset-2 transition hover:decoration-slate-950"
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
        className="mb-1.5 block text-sm font-medium text-slate-700"
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
        <p className="mt-1.5 text-xs font-medium text-rose-600">{error}</p>
      ) : null}
    </div>
  );
}
