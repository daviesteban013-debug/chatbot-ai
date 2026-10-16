import { getCurrentTenant, getCurrentUser } from "@/lib/auth";

/** Signed-in member of a business; jobs are owner/agent work, viewers only read lists. */
export async function jobsTeam() {
  const [user, tenant] = await Promise.all([getCurrentUser(), getCurrentTenant()]);
  if (!user || user.is_anonymous || !tenant) return null;
  return { user, tenant };
}

export const startErrors: Record<string, [number, string]> = {
  JOB_LIMIT: [429, "NEXO ya tiene dos trabajos en curso en este negocio. Espera a que terminen o cancela uno en Trabajos."],
  JOB_FILES: [400, "Adjunta el archivo correcto: para stock y precios una hoja XLSX o CSV; para importar, de uno a tres archivos."],
  JOB_FORBIDDEN: [403, "Tu rol no permite iniciar trabajos en esta conversación."],
  JOB_INPUT: [400, "La solicitud no es válida."],
};
