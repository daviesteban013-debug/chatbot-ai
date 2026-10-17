import { z } from "zod";
import { jarvisAccents, jarvisTones } from "./jarvis";

/**
 * The welcome portal: the first thing a new account sees. NEXO introduces itself and asks,
 * scene by scene, how it should be called, who it is talking to, what the store sells and
 * how it should behave and look. Pure data and rules here; the screen lives in the app.
 */
export type PortalKey = "agentName" | "displayName" | "businessName" | "businessType" | "city" | "tone" | "accent" | "voice" | "maxDiscountPct" | "autoConfirmMaxTotal" | "rules";
export type PortalKind = "text" | "chips-text" | "choice" | "swatches" | "voice" | "slider" | "money" | "textarea";
export type PortalAnswers = {
  agentName: string; displayName: string; businessName: string; businessType: string; city: string;
  tone: string; accent: string; voice: boolean; maxDiscountPct: number; autoConfirmMaxTotal: number; rules: string;
};
export type PortalScene = {
  key: PortalKey; kind: PortalKind; title: string;
  /** What NEXO says; {agent}, {you} and {store} are filled with earlier answers. */
  say: string; hint?: string; placeholder?: string; chips?: string[]; amounts?: number[]; skipLabel?: string;
  slider?: { min: number; max: number; step: number };
  /** What NEXO replies right after the answer (same placeholders plus {answer}). */
  after: string;
};

export const TONE_LABELS: Record<string, string> = { cercano: "Cercano", profesional: "Profesional", divertido: "Divertido", directo: "Directo" };
/** How a reply to a customer would sound in each tone: shown live while choosing. */
export const TONE_PREVIEWS: Record<string, string> = {
  cercano: "¡Claro que sí! Me quedan dos en talla 40. Si quieres te separo uno mientras decides 😊",
  profesional: "Con gusto. Disponemos de dos unidades en talla 40. ¿Desea que reserve una a su nombre?",
  divertido: "¡Tengo dos en talla 40 y están pidiendo a gritos salir de la bodega! ¿Te aparto uno?",
  directo: "Quedan 2 en talla 40. ¿Te aparto uno?",
};
export const ACCENT_NAMES: Record<string, string> = { "#facc15": "Ámbar", "#34d399": "Menta", "#38bdf8": "Cielo", "#22d3ee": "Cian", "#f472b6": "Rosa", "#a78bfa": "Violeta", "#fb7185": "Coral" };
export const AGENT_NAME_IDEAS = ["NEXO", "Lía", "Max", "Sol", "Vale", "Nova"];

export const PORTAL_SCENES: PortalScene[] = [
  { key: "agentName", kind: "text", title: "Mi nombre", say: "Hola. Soy tu agente de ventas: voy a vivir en tu tienda, atender a tus clientes por WhatsApp y cuidar tu CRM. Antes de empezar, ¿cómo quieres llamarme?",
    placeholder: "Escribe un nombre…", chips: AGENT_NAME_IDEAS, after: "Me gusta. Desde ahora soy {agent}." },
  { key: "displayName", kind: "text", title: "Tu nombre", say: "¿Y a ti cómo te digo?", placeholder: "Tu nombre o como prefieras que te llame", chips: ["Jefe", "Jefa"], after: "Listo, {you}. Un gusto." },
  { key: "businessName", kind: "text", title: "Tu tienda", say: "Cuéntame de tu tienda. ¿Cómo se llama?", placeholder: "Ej. Bellísima, Barbería El Fade…", after: "{store}. Suena bien." },
  { key: "businessType", kind: "chips-text", title: "Qué vendes", say: "¿Qué vende {store}?", placeholder: "Escribe otra categoría…",
    chips: ["Ropa y moda", "Calzado", "Tecnología", "Belleza", "Comida y bebidas", "Hogar y decoración", "Servicios"], after: "Anotado: {answer}." },
  { key: "city", kind: "chips-text", title: "Ciudad", say: "¿Desde qué ciudad operas principalmente?", placeholder: "Ej. Envigado, Antioquia…",
    chips: ["Bogotá", "Medellín", "Cali", "Barranquilla", "Cartagena", "Bucaramanga"], after: "Perfecto, {answer}." },
  { key: "tone", kind: "choice", title: "Personalidad", say: "Ahora mi personalidad. ¿Cómo quieres que les hable a tus clientes?", chips: jarvisTones, after: "Así hablaré con ellos." },
  { key: "accent", kind: "swatches", title: "Color", say: "Elige mi color. Lo verás en mi orbe, en la burbuja de tu computador y en todo el CRM.", chips: jarvisAccents, after: "Me queda bien." },
  { key: "voice", kind: "voice", title: "Voz", say: "¿Quieres que te hable en voz alta cuando trabajemos juntos? Puedes cambiarlo cuando quieras.", chips: ["Sí, háblame", "Solo texto"], after: "{answer}" },
  { key: "maxDiscountPct", kind: "slider", title: "Descuentos", say: "Dos límites y terminamos. ¿Hasta qué porcentaje de descuento puedo ofrecer sin consultarte?", slider: { min: 0, max: 40, step: 1 }, after: "{answer}" },
  { key: "autoConfirmMaxTotal", kind: "money", title: "Pedidos", say: "¿Hasta qué monto puedo confirmar pedidos por mi cuenta? Con $0 siempre te pregunto antes.", amounts: [0, 100000, 200000, 300000, 500000], after: "{answer}" },
  { key: "rules", kind: "textarea", title: "Reglas", say: "¿Alguna regla que deba respetar? Horarios, envíos, cambios, devoluciones…", placeholder: "Ej. Envío gratis desde $150.000. Cambios hasta 5 días hábiles…", skipLabel: "Sin reglas por ahora", after: "{answer}" },
];
export const PORTAL_TOTAL = PORTAL_SCENES.length;

export const portalDefaults: PortalAnswers = {
  agentName: "", displayName: "", businessName: "", businessType: "", city: "",
  tone: "cercano", accent: "#facc15", voice: true, maxDiscountPct: 10, autoConfirmMaxTotal: 0, rules: "",
};

/** Fills {agent}, {you}, {store} and {answer} in what NEXO says. */
export function fillLine(line: string, answers: Partial<PortalAnswers>, answer?: string): string {
  return line.replace(/\{agent\}/g, answers.agentName?.trim() || "NEXO").replace(/\{you\}/g, answers.displayName?.trim() || "")
    .replace(/\{store\}/g, answers.businessName?.trim() || "tu tienda").replace(/\{answer\}/g, answer ?? "").replace(/\s{2,}/g, " ").trim();
}

const money = (value: number) => `$${value.toLocaleString("es-CO")}`;
/** The answer as NEXO repeats it in the transmission log. */
export function describeAnswer(key: PortalKey, value: string | number | boolean): string {
  switch (key) {
    case "tone": return TONE_LABELS[String(value)] ?? String(value);
    case "accent": return ACCENT_NAMES[String(value)] ?? String(value);
    case "voice": return value ? "Con voz" : "Solo texto";
    case "maxDiscountPct": return Number(value) === 0 ? "Sin descuentos automáticos" : `Hasta ${value}% de descuento`;
    case "autoConfirmMaxTotal": return Number(value) === 0 ? "Siempre me preguntas" : `Confirmo hasta ${money(Number(value))}`;
    case "rules": return String(value).trim() || "Sin reglas por ahora";
    default: return String(value);
  }
}
/** What NEXO answers right after each scene. */
export function afterLine(scene: PortalScene, answers: Partial<PortalAnswers>, value: string | number | boolean): string {
  const answer = describeAnswer(scene.key, value);
  if (scene.key === "voice") return value ? "Perfecto. Me vas a oír cuando me actives." : "Entendido. Trabajaré en silencio.";
  if (scene.key === "maxDiscountPct") return Number(value) === 0 ? "Sin descuentos por mi cuenta. Cualquier rebaja pasa por ti." : `Hasta ${value}% sin molestarte. Más que eso, te consulto.`;
  if (scene.key === "autoConfirmMaxTotal") return Number(value) === 0 ? "Siempre te preguntaré antes de confirmar un pedido." : `Confirmo pedidos hasta ${money(Number(value))}; los más grandes te los muestro primero.`;
  if (scene.key === "rules") return String(value).trim() ? "Reglas guardadas. Las respetaré en cada conversación." : "Sin reglas por ahora. Las puedes agregar luego desde el CRM.";
  return fillLine(scene.after, answers, answer);
}

const text = (min: number, max: number) => z.string().trim().min(min).max(max);
/** What the portal sends when it finishes; the server re-validates everything. */
export const portalSubmission = z.object({
  agentName: text(2, 24).refine(value => value.toLowerCase() !== "jarvis", "Ese nombre está reservado."),
  displayName: text(1, 40),
  businessName: text(2, 48),
  businessType: text(2, 120),
  city: text(2, 120),
  tone: z.enum(jarvisTones as [string, ...string[]]),
  accent: z.enum(jarvisAccents as [string, ...string[]]),
  voice: z.boolean(),
  maxDiscountPct: z.number().int().min(0).max(40),
  autoConfirmMaxTotal: z.number().int().min(0).max(50_000_000),
  rules: z.string().trim().max(2000).default(""),
}).strict();
export type PortalSubmission = z.infer<typeof portalSubmission>;

/** Validates one answer before NEXO accepts it; null means it is fine. */
export function validateAnswer(scene: PortalScene, value: string | number | boolean): string | null {
  const shape = portalSubmission.shape[scene.key];
  const result = shape.safeParse(typeof value === "string" ? value.trim() : value);
  if (result.success) return null;
  switch (scene.key) {
    case "agentName": return String(value).trim().toLowerCase() === "jarvis" ? "Ese nombre está reservado; elige otro." : "Un nombre de 2 a 24 letras.";
    case "displayName": return "Dime al menos cómo llamarte.";
    case "businessName": return "El nombre de la tienda necesita de 2 a 48 letras.";
    case "businessType": case "city": return "Escribe al menos dos letras.";
    case "rules": return "Las reglas caben en 2 000 caracteres.";
    default: return "Revisa ese dato.";
  }
}

/** Typing speed for NEXO's lines: quick, with a short pause per sentence. */
export function typingSchedule(line: string, charMs = 18, sentencePauseMs = 220): number[] {
  const delays: number[] = [];
  let at = 0;
  for (const char of line) { at += charMs; if (/[.!?…]/.test(char)) at += sentencePauseMs; delays.push(at); }
  return delays;
}

/** The summary NEXO shows before entering the CRM. */
export function portalSummary(answers: PortalSubmission): { label: string; value: string }[] {
  return [
    { label: "Agente", value: answers.agentName }, { label: "Te llamo", value: answers.displayName }, { label: "Tienda", value: `${answers.businessName} · ${answers.businessType}` },
    { label: "Ciudad", value: answers.city }, { label: "Personalidad", value: TONE_LABELS[answers.tone] ?? answers.tone },
    { label: "Color", value: ACCENT_NAMES[answers.accent] ?? answers.accent }, { label: "Voz", value: answers.voice ? "Activa" : "Solo texto" },
    { label: "Límites", value: `${describeAnswer("maxDiscountPct", answers.maxDiscountPct)} · ${describeAnswer("autoConfirmMaxTotal", answers.autoConfirmMaxTotal)}` },
  ];
}
