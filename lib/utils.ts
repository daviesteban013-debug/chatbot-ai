import { twMerge } from "tailwind-merge";

/**
 * Combina clases CSS condicionales y resuelve conflictos de Tailwind.
 * Filtra valores falsy, une con un espacio y aplica tailwind-merge para que
 * las clases escritas después ganen sobre las anteriores en conflictos reales
 * (ej. "p-5 ... p-0" o "bg-slate-100 ... bg-slate-900").
 */
export function cn(
  ...inputs: Array<string | false | null | undefined>
): string {
  return twMerge(inputs.filter(Boolean).join(" "));
}

/**
 * Formatea una fecha ISO a fecha larga en español.
 * Parsea manualmente los componentes para evitar desfases de zona horaria.
 * Acepta "YYYY-MM-DD" o un datetime ISO.
 * Ej. "2026-10-15" -> "15 de octubre de 2026"
 */
export function formatDate(iso: string): string {
  const datePart = iso.split("T")[0] ?? iso;
  const [year, month, day] = datePart.split("-").map(Number);
  if (!year || !month || !day) return iso;
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * Formatea un número como moneda.
 * Ej. 29 -> "$29.00"
 */
export function formatCurrency(n: number): string {
  return `$${n.toFixed(2)}`;
}
