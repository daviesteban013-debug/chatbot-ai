"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Cierra la sesión del usuario y lo devuelve al login.
 * Las cookies de sesión se limpian dentro de este Server Action (el único
 * lugar, junto a los Route Handlers, donde Next.js permite escribir cookies).
 */
export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
