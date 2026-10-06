import type { Metadata } from "next";
import { ConfirmForm } from "./confirm-form";

export const metadata: Metadata = { title: "Confirma tu correo — Nexo.ai", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function ConfirmPage({ searchParams }: { searchParams: Promise<{ token_hash?: string; type?: string }> }) {
  const params = await searchParams;
  const token = typeof params.token_hash === "string" && /^[a-zA-Z0-9_-]{16,256}$/.test(params.token_hash) && (!params.type || params.type === "email" || params.type === "signup") ? params.token_hash : null;
  return <ConfirmForm tokenHash={token} />;
}
