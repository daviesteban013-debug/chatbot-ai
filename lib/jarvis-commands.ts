export type JarvisCommand = "wake" | "sleep" | "crm";

/** Only whole commands match: quoted instructions and business messages stay chat. */
export function jarvisCommand(text: string): JarvisCommand | null {
  const command = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[.,¡!¿?;:]/g, " ").trim().replace(/\s+/g, " ")
    .replace(/^jarvis\s+/, "").replace(/\s+por favor$/, "");
  if (/^(enciendete|enciende|encender|encender jarvis|activate|activar|activar jarvis|despierta|inicia)$/.test(command)) return "wake";
  if (/^(apagate|apagar|apagar jarvis|desactivate|descansa)$/.test(command)) return "sleep";
  if (/^(abre el crm|abre crm|abrir crm|abrir el crm|ir al crm|muestrame el crm)$/.test(command)) return "crm";
  return null;
}
