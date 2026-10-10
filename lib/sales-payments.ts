import { z } from "zod";

export const salesPaymentsSchema = z.object({
  linkUrl: z.string().trim().max(2048).refine(value => !value || /^https:\/\/[A-Za-z0-9.-]+(?::443)?(?:[/?#][^\s]*)?$/.test(value), "Usa un enlace HTTPS sin usuario ni contraseña."),
  transferInstructions: z.string().trim().max(2000, "Las instrucciones admiten hasta 2000 caracteres."),
}).strict();
export type SalesPaymentsInput = z.infer<typeof salesPaymentsSchema>;
export function salesPayments(value: unknown) {
  const config = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return { linkUrl: typeof config.link_url === "string" ? config.link_url : "", transferInstructions: typeof config.transfer_instructions === "string" ? config.transfer_instructions : "" };
}
