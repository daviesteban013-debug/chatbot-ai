"use client";
import { useState } from "react";
import { DesktopBubble } from "@/components/jarvis/desktop-bubble";
/** Local visual fixture only. No authentication, audio capture or AI requests. */
export function NexoDesktopPreview() {
  const [input, setInput] = useState("");
  const [powered, setPowered] = useState(false);
  const [voice, setVoice] = useState(false);
  const [reply, setReply] = useState("");
  return <DesktopBubble powered={powered} listening={powered} armed={powered} busy={false} speaking={false} voice={voice} readyToPlay={false}
    activity={powered ? "Vista previa de escucha · sin micrófono real" : "Listo cuando tú lo estés"} reply={reply} input={input}
    onPower={() => setPowered(value => !value)} onMicrophone={() => setPowered(value => !value)} onVoice={() => setVoice(value => !value)} onStop={() => {}} onResume={() => {}} onInput={setInput} onSubmit={event => { event.preventDefault(); if (input.trim()) { setReply("Vista previa del diseño. En tu cuenta, NEXO consulta los datos reales del CRM y reúne las respuestas de sus agentes.\n\nPuedes seguir hablando o abrir el CRM desde el acceso superior."); setInput(""); } }} />;
}
