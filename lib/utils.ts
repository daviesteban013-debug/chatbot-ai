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
 * Formatea un entero de pesos colombianos (COP) como moneda.
 * En el esquema el dinero se guarda como integer sin decimales.
 * Ej. 45000 -> "$ 45.000"
 */
export function formatCOP(amount: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
  }).format(amount);
}

/**
 * Formatea un datetime ISO como fecha corta + hora en español.
 * Ej. "2026-10-01T14:32:00Z" -> "1 oct 2026, 9:32 a. m."
 */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("es-CO", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Tiempo relativo compacto en español para listas de actividad.
 * Ej. "Hace 5 min", "Hace 3 h", "Hace 2 días".
 */
export function timeAgo(iso: string, now: number = Date.now()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const seconds = Math.max(0, Math.floor((now - date.getTime()) / 1000));
  if (seconds < 60) return "Hace unos segundos";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `Hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Hace ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `Hace ${days} ${days === 1 ? "día" : "días"}`;
  return formatDate(iso);
}

/**
 * Hora corta (hh:mm) para burbujas de chat.
 */
export function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("es-CO", {
    hour: "numeric",
    minute: "2-digit",
  });
}
