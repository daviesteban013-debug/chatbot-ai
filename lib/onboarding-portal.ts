import { z } from "zod";
import { jarvisAccents, jarvisTones } from "./jarvis";

/**
 * The welcome portal: the first thing a new account sees. Zorax introduces itself and asks,
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
  /** What Zorax says; {agent}, {you} and {store} are filled with earlier answers. */
  say: string; hint?: string; placeholder?: string; chips?: string[]; amounts?: number[]; skipLabel?: string;
  slider?: { min: number; max: number; step: number };
  /** What Zorax replies right after the answer (same placeholders plus {answer}). */
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
export const AGENT_NAME_IDEAS = ["Zorax", "Lía", "Max", "Sol", "Vale", "Nova"];

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

/** Fills {agent}, {you}, {store} and {answer} in what Zorax says. */
export function fillLine(line: string, answers: Partial<PortalAnswers>, answer?: string): string {
  return line.replace(/\{agent\}/g, answers.agentName?.trim() || "Zorax").replace(/\{you\}/g, answers.displayName?.trim() || "")
    .replace(/\{store\}/g, answers.businessName?.trim() || "tu tienda").replace(/\{answer\}/g, answer ?? "").replace(/\s{2,}/g, " ").trim();
}

const money = (value: number) => `$${value.toLocaleString("es-CO")}`;
/** The answer as Zorax repeats it in the transmission log. */
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
/** What Zorax answers right after each scene. */
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

/** Validates one answer before Zorax accepts it; null means it is fine. */
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

// ---------- Spoken answers ----------
// The owner answers Zorax out loud. These parsers turn a transcript into the value a scene
// expects without a model call: choices by keyword, amounts in Colombian Spanish, yes/no, and
// names with the usual lead-ins ("me llamo", "la tienda se llama") stripped. Text scenes are
// also run through the model on the server when it is available; this is the fallback and the
// fast path.
const plain = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[¿?¡!.,;:"«»()]/g, " ").replace(/\s+/g, " ").trim();
const NUMBER_WORDS: Record<string, number> = {
  cero: 0, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15,
  dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19, veinte: 20, veintiuno: 21, veintidos: 22, veintitres: 23, veinticuatro: 24, veinticinco: 25, veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29,
  treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90, cien: 100, ciento: 100, doscientos: 200, trescientos: 300, cuatrocientos: 400, quinientos: 500, seiscientos: 600, setecientos: 700, ochocientos: 800, novecientos: 900,
};
/** The number in a spoken Colombian phrase: "200 mil", "doscientos cincuenta mil", "medio millón", "1.500.000", "15 por ciento". Null when there is none. */
export function spokenNumber(text: string): number | null {
  // Thousand separators inside digits stay together; "por ciento" and "%" are units, not numbers.
  const words = plain(text.replace(/(\d)\.(?=\d)/g, "$1").replace(/%/g, " ")).replace(/\bpor ?ciento\b/g, " ")
    .replace(/\bmedio millon\b/g, "500 mil").replace(/\bmillon(es)?\b/g, "millon").split(" ");
  let total = 0, current = 0, seen = false;
  for (const raw of words) {
    const word = raw.replace(/^(\d[\d.]*)k$/, "$1 mil");
    for (const piece of word.split(" ")) {
      if (/^\d[\d.]*(,\d+)?$/.test(piece)) { current += Number(piece.replace(/\./g, "").replace(",", ".")); seen = true; continue; }
      if (piece === "mil") { total += (current || 1) * 1000; current = 0; seen = true; continue; }
      if (piece === "millon") { total += (current || 1) * 1_000_000; current = 0; seen = true; continue; }
      if (piece in NUMBER_WORDS) { current += NUMBER_WORDS[piece]; seen = true; }
    }
  }
  if (!seen) return null;
  return Math.round(total + current);
}
const TONE_WORDS: Record<string, string[]> = {
  cercano: ["cercano", "cercana", "calido", "calida", "amable", "amigable", "relajado", "relajada", "natural", "familiar", "tranquilo", "carinoso", "carinosa"],
  profesional: ["profesional", "formal", "serio", "seria", "elegante", "corporativo", "corporativa", "ejecutivo"],
  divertido: ["divertido", "divertida", "gracioso", "graciosa", "chistoso", "chistosa", "alegre", "jovial", "humor", "fresco", "fresca", "chevere"],
  directo: ["directo", "directa", "al grano", "concreto", "concreta", "breve", "corto", "corta", "sin rodeos", "rapido", "rapida", "preciso"],
};
const ACCENT_WORDS: Record<string, string[]> = {
  "#facc15": ["ambar", "amarillo", "amarilla", "dorado", "dorada", "oro"],
  "#34d399": ["menta", "verde"],
  "#38bdf8": ["cielo", "celeste", "azul"],
  "#22d3ee": ["cian", "turquesa", "aguamarina", "aqua"],
  "#f472b6": ["rosa", "rosado", "rosada", "fucsia"],
  "#a78bfa": ["violeta", "morado", "morada", "lila", "purpura"],
  "#fb7185": ["coral", "rojo", "roja", "naranja", "salmon"],
};
const LEAD_INS = [
  /^(?:eh|em|mmm+|pues|bueno|ok|okey|a ver|este|listo|entonces|mira)[\s,]+/,
  /^(?:quiero que (?:te|se) llames?|me gustaria que te llamaras|que te llames|te (?:llamas|llamaras|vas a llamar)|te llamare|te voy a llamar|llamate|ponte|seras|tu nombre (?:es|sera|va a ser)|te pongo|vas a ser)\s+/,
  /^(?:me llamo|yo soy|soy|mi nombre es|llamame|dime|me dicen|me puedes decir|puedes decirme|me gusta que me digan)\s+/,
  /^(?:la tienda se llama|mi tienda se llama|mi negocio se llama|se llama|mi tienda es|mi negocio es|la tienda es|es|somos)\s+/,
  /^(?:vendo|vendemos|vende|trabajamos con|trabajo con|hacemos|ofrecemos|es una tienda de|una tienda de|tienda de|de)\s+/,
  /^(?:estoy en|estamos en|desde|operamos en|operamos desde|trabajamos desde|en la ciudad de|en|aqui en|aca en)\s+/,
];
const trimName = (text: string) => text.replace(/\s+/g, " ").replace(/^[\s,.:;"«»]+|[\s,.:;"«»]+$/g, "").trim();
const titleCase = (text: string) => text.replace(/(^|\s)(\p{L})/gu, (_, space, letter) => space + letter.toUpperCase());
const titleFirst = (text: string) => (text ? text[0].toUpperCase() + text.slice(1) : text);
/** Strips the spoken lead-in ("me llamo", "la tienda se llama") and tidies the remaining words. */
export function cleanSpokenText(key: PortalKey, transcript: string): string {
  let text = trimName(transcript);
  // Fillers and lead-ins stack ("eh, quiero que te llames Lía"): peel them one at a time.
  for (let pass = 0; pass < 3; pass++) {
    const lower = plain(text);
    const match = LEAD_INS.map(pattern => pattern.exec(lower)).find(Boolean);
    if (!match) break;
    // The lead-in sits at the start of the plain form; cut the same number of words from the original.
    const words = match[0].trim().split(" ").length;
    text = trimName(text.split(/\s+/).slice(words).join(" "));
  }
  if (key === "agentName" || key === "displayName" || key === "city") return titleCase(text.toLowerCase());
  return titleFirst(text);
}
export type SpokenResult = { ok: true; value: string | number | boolean } | { ok: false; reply: string };
/** What a scene understands from a transcript without the model; text scenes get the cleaned words. */
export function parseSpokenAnswer(scene: PortalScene, transcript: string): SpokenResult {
  const words = plain(transcript);
  const repeat = (hint: string): SpokenResult => ({ ok: false, reply: hint });
  if (!words) return repeat("No alcancé a oírte. ¿Me lo repites?");
  const padded = ` ${words} `;
  switch (scene.key) {
    case "tone": {
      const hit = Object.entries(TONE_WORDS).find(([, list]) => list.some(word => padded.includes(` ${word} `)));
      return hit ? { ok: true, value: hit[0] } : repeat("Puedo ser cercano, profesional, divertido o directo. ¿Cuál prefieres?");
    }
    case "accent": {
      const hit = Object.entries(ACCENT_WORDS).find(([, list]) => list.some(word => padded.includes(` ${word} `)));
      return hit ? { ok: true, value: hit[0] } : repeat("Tengo ámbar, menta, cielo, cian, rosa, violeta y coral. ¿Cuál te gusta?");
    }
    case "voice": {
      if (/\b(solo texto|sin voz|en silencio|silencio|mudo|muda|por escrito|no hables|no me hables|mejor no)\b/.test(words) || /^(no|nel|nop)\b/.test(words)) return { ok: true, value: false };
      if (/\b(si|sip|claro|dale|obvio|por supuesto|hablame|con voz|activa|activala|quiero|me gusta|perfecto|listo|de una|vale|ok|okey)\b/.test(words)) return { ok: true, value: true };
      return repeat("¿Te hablo en voz alta, sí o no?");
    }
    case "maxDiscountPct": {
      if (/\b(sin descuento|sin descuentos|ningun descuento|ninguno|nada|cero|no des|no quiero descuentos)\b/.test(words)) return { ok: true, value: 0 };
      const number = spokenNumber(words);
      if (number === null) return repeat("Dime un porcentaje, por ejemplo diez por ciento, o di «sin descuentos».");
      if (number > 40) return repeat("Hasta cuarenta por ciento como máximo. ¿Qué porcentaje dejo?");
      return { ok: true, value: Math.round(number) };
    }
    case "autoConfirmMaxTotal": {
      if (/\b(siempre|preguntame|pregunta|nunca|ninguno|ninguna|cero|nada|no confirmes|consultame)\b/.test(words)) return { ok: true, value: 0 };
      const number = spokenNumber(words);
      if (number === null || number < 1000) return repeat("Dime un monto en pesos, por ejemplo doscientos mil, o di «siempre pregúntame».");
      if (number > 50_000_000) return repeat("Hasta cincuenta millones como máximo. ¿Qué monto dejo?");
      return { ok: true, value: number };
    }
    case "rules": {
      if (words.length < 40 && /^(no|nada|ninguna|ninguno|sin reglas|por ahora no|no por ahora|ahora no|luego|despues|mas tarde)\b/.test(words)) return { ok: true, value: "" };
      return { ok: true, value: titleFirst(trimName(transcript)).slice(0, 2000) };
    }
    default: {
      const value = cleanSpokenText(scene.key, transcript);
      const problem = validateAnswer(scene, value);
      return problem ? repeat(`${problem} ¿Me lo repites?`) : { ok: true, value };
    }
  }
}

/** Typing speed for Zorax's lines: quick, with a short pause per sentence. */
export function typingSchedule(line: string, charMs = 18, sentencePauseMs = 220): number[] {
  const delays: number[] = [];
  let at = 0;
  for (const char of line) { at += charMs; if (/[.!?…]/.test(char)) at += sentencePauseMs; delays.push(at); }
  return delays;
}

/** The summary Zorax shows before entering the CRM. */
export function portalSummary(answers: PortalSubmission): { label: string; value: string }[] {
  return [
    { label: "Agente", value: answers.agentName }, { label: "Te llamo", value: answers.displayName }, { label: "Tienda", value: `${answers.businessName} · ${answers.businessType}` },
    { label: "Ciudad", value: answers.city }, { label: "Personalidad", value: TONE_LABELS[answers.tone] ?? answers.tone },
    { label: "Color", value: ACCENT_NAMES[answers.accent] ?? answers.accent }, { label: "Voz", value: answers.voice ? "Activa" : "Solo texto" },
    { label: "Límites", value: `${describeAnswer("maxDiscountPct", answers.maxDiscountPct)} · ${describeAnswer("autoConfirmMaxTotal", answers.autoConfirmMaxTotal)}` },
  ];
}
