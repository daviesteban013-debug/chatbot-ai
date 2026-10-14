import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { ResetForm } from "./reset-form";

export const metadata: Metadata = { title: "Nueva contraseña · NEXO", robots: { index: false, follow: false }, referrer: "no-referrer" };

/** Reached from the recovery email: with a session (same browser) or a token to verify (any device). */
export default async function ResetPage({ searchParams }: { searchParams: Promise<{ token_hash?: string; type?: string }> }) {
  const params = await searchParams;
  const { data: { user } } = await (await createClient()).auth.getUser();
  const token = !user && typeof params.token_hash === "string" && /^[a-zA-Z0-9_-]{16,256}$/.test(params.token_hash) && params.type === "recovery" ? params.token_hash : null;
  return <ResetForm email={user?.email ?? null} tokenHash={token} />;
}
