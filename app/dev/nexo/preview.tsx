"use client";
import { useState } from "react";
import { DesktopBubble } from "@/components/jarvis/desktop-bubble";
/** Local visual fixture only. No authentication, audio capture or AI requests. */
export function NexoDesktopPreview() {
  const [input, setInput] = useState("");
  return <DesktopBubble powered={false} listening={false} armed={false} busy={false} speaking={false} voice={false} readyToPlay={false}
    activity="Vista previa · micrófono apagado" reply={"Estoy aquí. ¿Qué vamos a hacer hoy?\n\nPuedes decirme: «abre pedidos», «abre catálogo» o «muéstrame pagos»."} input={input}
    onPower={() => {}} onMicrophone={() => {}} onVoice={() => {}} onStop={() => {}} onResume={() => {}} onInput={setInput} onSubmit={event => event.preventDefault()} />;
}
