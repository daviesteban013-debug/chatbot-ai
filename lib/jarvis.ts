export interface JarvisConfig {
  name: string;
  business: string;
  tone: string;
  accent: string;
  welcome: string;
  rules: string;
  maxDiscount: number;
  abilities: string[];
}

export const jarvisDefaults: JarvisConfig = {
  name: "NEXO",
  business: "",
  tone: "cercano",
  accent: "#facc15",
  welcome: "¡Hola! Soy {agente}, el asistente de {negocio}. ¿En qué te puedo ayudar hoy?",
  rules: "",
  maxDiscount: 10,
  abilities: ["catalogo", "pedidos", "handoff"],
};

export const jarvisTones = ["cercano", "profesional", "divertido", "directo"];
export const jarvisAccents = ["#facc15", "#34d399", "#38bdf8", "#f472b6", "#a78bfa"];
export const jarvisAbilityIds = ["catalogo", "pedidos", "agenda", "handoff", "seguimiento"];

/** Normaliza y acota cualquier entrada (cliente o BD) a un JarvisConfig válido. */
export function sanitizeJarvisConfig(input: unknown): JarvisConfig {
  const o = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const str = (v: unknown, max: number, fallback: string) =>
    typeof v === "string" ? v.slice(0, max) : fallback;
  const d = jarvisDefaults;
  return {
    name: typeof o.name === "string" && o.name.trim().toLowerCase() === "jarvis" ? d.name : str(o.name, 24, d.name),
    business: str(o.business, 48, d.business),
    tone: jarvisTones.includes(o.tone as string) ? (o.tone as string) : d.tone,
    accent: jarvisAccents.includes(o.accent as string) ? (o.accent as string) : d.accent,
    welcome: str(o.welcome, 300, d.welcome),
    rules: str(o.rules, 1500, d.rules),
    maxDiscount:
      typeof o.maxDiscount === "number" ? Math.min(30, Math.max(0, Math.round(o.maxDiscount))) : d.maxDiscount,
    abilities: Array.isArray(o.abilities)
      ? o.abilities.filter((a): a is string => typeof a === "string" && jarvisAbilityIds.includes(a))
      : d.abilities,
  };
}
