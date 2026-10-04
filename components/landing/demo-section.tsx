"use client";

import { useState, useRef, useEffect, FormEvent } from "react";
import Link from "next/link";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  Check,
  CheckCheck,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";

interface DemoMessage {
  id: string;
  from: "user" | "bot";
  text: string;
  time: string;
}

interface SectorScenario {
  id: string;
  badge: string;
  name: string;
  businessName: string;
  avatarIcon: string;
  description: string;
  quickPrompts: string[];
  initialMessages: DemoMessage[];
  responses: Record<string, string>;
  defaultResponse: string;
  leadStatus: string;
  intentDetected: string;
  timeSaved: string;
}

const SECTORS: SectorScenario[] = [
  {
    id: "restaurante",
    badge: "Gastronomía",
    name: "Restaurante & Café",
    businessName: "Casa Miga · Brunch & Café",
    avatarIcon: "☕",
    description: "Toma pedidos, calcula totales con adiciones y envía confirmación con dirección de entrega.",
    quickPrompts: [
      "¿Tienen desayunos disponibles ahora?",
      "¿Cuánto vale el combo con café?",
      "Quiero pedir 2 para entregar a las 9 am",
      "¿Qué medios de pago reciben?",
    ],
    initialMessages: [
      {
        id: "m1",
        from: "user",
        text: "¡Hola! ¿Tienen domicilios de desayuno disponibles hoy?",
        time: "9:02 am",
      },
      {
        id: "m2",
        from: "bot",
        text: "¡Hola! Sí, claro 🥐. Nuestro Combo de la Casa incluye arepa campesina con queso, huevos al gusto y café de origen por $24.000 COP. ¿Cuántos te preparamos?",
        time: "9:02 am",
      },
    ],
    responses: {
      "desayuno": "El Desayuno de la Casa vale $24.000 COP y el Americano $28.000 COP. Ambos incluyen bebida caliente y jugo de naranja natural.",
      "combo": "El Combo de la Casa está en $24.000 COP. Si agregas porción extra de tocineta son $4.500 COP adicionales.",
      "pedir": "¡Perfecto! Anoto 2 desayunos ($48.000 COP). ¿Nos indicas tu dirección exacta y método de pago preferido para despachar?",
      "pago": "Recibimos Nequi, Daviplata, transferencias Bancolombia y datáfono contra entrega. ¿Cuál prefieres?",
      "precio": "Nuestros platos van desde $18.000 hasta $32.000 COP. Todos con ingredientes frescos del día.",
    },
    defaultResponse: "¡Con gusto! El pedido queda pre-registrado. ¿Deseas agregar bebidas o cubiertos adicionales a tu orden?",
    leadStatus: "Pedido en preparación",
    intentDetected: "Toma de Pedido & Checkout",
    timeSaved: "8 min ahorrados al mesero",
  },
  {
    id: "barberia",
    badge: "Belleza & Estilo",
    name: "Barbería & Spa",
    businessName: "Estudio Norte Barber Studio",
    avatarIcon: "💈",
    description: "Consulta turnos libres en tiempo real, reserva el servicio y envía recordatorio.",
    quickPrompts: [
      "¿Hay espacio para corte y barba hoy?",
      "¿Qué horario tienen disponible mañana?",
      "¿Qué precio tiene el corte premium?",
      "Confírmame a las 4:00 pm por favor",
    ],
    initialMessages: [
      {
        id: "b1",
        from: "user",
        text: "Buenas tardes, ¿tienen turno para corte de cabello hoy?",
        time: "3:15 pm",
      },
      {
        id: "b2",
        from: "bot",
        text: "¡Hola! Sí tenemos disponibilidad hoy con el barbero principal: a las 4:30 pm o 6:00 pm. El corte vale $35.000 COP. ¿Cuál hora te reservo?",
        time: "3:15 pm",
      },
    ],
    responses: {
      "corte": "El corte clásico vale $30.000 COP y con barba incluida $45.000 COP (incluye toalla caliente y vaporizador).",
      "horario": "Para mañana tenemos turnos a las 10:00 am, 11:30 am, 3:00 pm y 5:30 pm.",
      "precio": "Corte de cabello: $30.000 COP · Barba perfilada: $20.000 COP · Combo completo: $45.000 COP.",
      "confirma": "¡Queda agendada tu cita! Te enviamos recordatorio 2 horas antes a este mismo WhatsApp. ¡Te esperamos!",
      "tarde": "Tenemos disponibilidad a las 4:30 pm y 6:00 pm hoy. ¿A qué nombre apartamos el turno?",
    },
    defaultResponse: "Perfecto. Te agendo el espacio inmediatamente en nuestro calendario. ¿A nombre de quién registramos la cita?",
    leadStatus: "Cita pre-agendada",
    intentDetected: "Reserva de Calendario",
    timeSaved: "12 min en llamadas de agenda",
  },
  {
    id: "tienda",
    badge: "E-commerce & Retail",
    name: "Boutique & Ropa",
    businessName: "Aura Concept Store",
    avatarIcon: "🛍️",
    description: "Recomienda productos del catálogo, verifica tallas disponibles y comparte enlace de pago.",
    quickPrompts: [
      "¿Tienen disponible la chaqueta overside negra?",
      "¿Qué tallas manejan?",
      "¿Hacen envíos a Medellín / Cali?",
      "¿Tienen cambio si no me queda?",
    ],
    initialMessages: [
      {
        id: "t1",
        from: "user",
        text: "Hola, vi en su Instagram la chaqueta bomber negra. ¿La tienen en talla M?",
        time: "11:40 am",
      },
      {
        id: "t2",
        from: "bot",
        text: "¡Hola! Sí, nos quedan las últimas 3 unidades en talla M en color negro. Su valor es $149.000 COP con envío nacional gratis hoy 🖤. ¿Te reservo una?",
        time: "11:40 am",
      },
    ],
    responses: {
      "talla": "Manejamos tallas desde la XS hasta la XL. Te comparto la guía de medidas en centímetros para que elijas la ideal.",
      "envio": "Hacemos envíos a todo Colombia. A ciudades principales tarda de 24 a 48 horas hábiles. ¡Por compras mayores a $120.000 COP el envío es gratis!",
      "cambio": "¡Sí! Tienes hasta 30 días para cambios sin costo adicional por talla o referencia.",
      "precio": "La chaqueta bomber tiene un precio de lanzamiento de $149.000 COP. Aceptamos tarjetas, PSE y Addi.",
    },
    defaultResponse: "Excelente elección. Puedo generarte el enlace de pago seguro en 1 segundo para despacharte hoy mismo.",
    leadStatus: "Venta calificada lista",
    intentDetected: "Consulta de Catálogo & Cierre",
    timeSaved: "15 min de atención manual",
  },
  {
    id: "servicios",
    badge: "Profesionales",
    name: "Consultoría & Servicios",
    businessName: "Innova Soluciones Legales",
    avatarIcon: "💼",
    description: "Filtra el tipo de necesidad del cliente, solicita documentos y agenda reunión con el especialista.",
    quickPrompts: [
      "Necesito registrar mi marca comercial",
      "¿Cuánto cuesta la asesoría inicial?",
      "¿Cuánto tiempo tarda el trámite?",
      "Quiero hablar con un abogado",
    ],
    initialMessages: [
      {
        id: "s1",
        from: "user",
        text: "Buenos días, busco asesoría para registrar la marca de mi empresa ante la SIC.",
        time: "10:10 am",
      },
      {
        id: "s2",
        from: "bot",
        text: "¡Hola! Con gusto te asesoramos ⚖️. Realizamos el estudio previo de viabilidad sin costo en 24h. ¿Cuál es el nombre de la marca que deseas proteger?",
        time: "10:10 am",
      },
    ],
    responses: {
      "precio": "El estudio de viabilidad es 100% gratuito. El trámite completo con tasas de la SIC y honorarios tiene tarifa fija desde $750.000 COP.",
      "tiempo": "El proceso formal ante la Superintendencia toma entre 6 y 9 meses, pero la protección rige desde el día de la radicación inicial.",
      "abogado": "Claro que sí, puedo agendarte una videollamada de 20 minutos con uno de nuestros abogados senior hoy mismo. ¿Te sirve a las 4:00 pm?",
      "marca": "Anotado. Verificamos fonética y antecedentes de inmediato y te enviamos el informe de viabilidad a este WhatsApp.",
    },
    defaultResponse: "Entendido. Registramos tu caso para que nuestro especialista te entregue la respuesta técnica en la llamada.",
    leadStatus: "Lead de alto valor",
    intentDetected: "Calificación B2B & Captura",
    timeSaved: "25 min en filtrado de leads",
  },
];

export function DemoSection() {
  const reduced = useReducedMotion();
  const [activeSectorIndex, setActiveSectorIndex] = useState(0);
  const currentSector = SECTORS[activeSectorIndex];

  const [messages, setMessages] = useState<DemoMessage[]>(currentSector.initialMessages);
  const [inputText, setInputText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [responseTimeMs, setResponseTimeMs] = useState(820);

  const chatContainerRef = useRef<HTMLDivElement>(null);
  const msgSeq = useRef(1000);

  // Switch sector resets messages
  function handleSelectSector(index: number) {
    setActiveSectorIndex(index);
    setMessages(SECTORS[index].initialMessages);
    setIsTyping(false);
  }

  // Auto-scroll chat
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  function simulateBotReply(userPrompt: string) {
    setIsTyping(true);
    const lower = userPrompt.toLowerCase();

    // Find best match in responses
    let matchedReply = currentSector.defaultResponse;
    for (const [keyword, answer] of Object.entries(currentSector.responses)) {
      if (lower.includes(keyword)) {
        matchedReply = answer;
        break;
      }
    }

    const calculatedTime = 750 + (userPrompt.length % 5) * 50;

    window.setTimeout(() => {
      setResponseTimeMs(calculatedTime);
      setIsTyping(false);
      msgSeq.current += 1;
      setMessages((prev) => [
        ...prev,
        {
          id: `bot-msg-${msgSeq.current}`,
          from: "bot",
          text: matchedReply,
          time: "10:24 am",
        },
      ]);
    }, calculatedTime);
  }

  function handleSend(e?: FormEvent) {
    if (e) e.preventDefault();
    if (!inputText.trim() || isTyping) return;

    msgSeq.current += 1;
    const userMsg: DemoMessage = {
      id: `user-msg-${msgSeq.current}`,
      from: "user",
      text: inputText.trim(),
      time: "10:24 am",
    };

    setMessages((prev) => [...prev, userMsg]);
    const textToSend = inputText;
    setInputText("");
    simulateBotReply(textToSend);
  }

  function handleQuickPrompt(promptText: string) {
    if (isTyping) return;
    msgSeq.current += 1;
    const userMsg: DemoMessage = {
      id: `user-msg-${msgSeq.current}`,
      from: "user",
      text: promptText,
      time: "10:24 am",
    };
    setMessages((prev) => [...prev, userMsg]);
    simulateBotReply(promptText);
  }

  function handleResetChat() {
    setMessages(currentSector.initialMessages);
    setIsTyping(false);
  }

  return (
    <section
      id="demo"
      aria-labelledby="demo-heading"
      className="relative isolate overflow-hidden border-t border-white/10 bg-zinc-950 py-24 sm:py-32 scroll-mt-20"
    >
      {/* Background ambient lighting */}
      <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 h-[600px] w-[950px] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(250,204,21,0.08),rgba(16,185,129,0.04)_45%,transparent_75%)] blur-3xl" />
      <div className="pointer-events-none absolute inset-0 opacity-15 cyber-grid-pattern" />

      <div className="relative mx-auto max-w-7xl px-5 sm:px-8">
        {/* Section Header */}
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-yellow-400/30 bg-yellow-400/10 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wider text-yellow-300">
            <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
            Demostración Interactiva en Vivo
          </div>

          <h2
            id="demo-heading"
            className="mt-6 text-balance text-3xl font-medium tracking-tight text-white sm:text-5xl"
          >
            Pruébalo tú mismo.
            <span className="mt-2 block bg-gradient-to-r from-yellow-200 via-yellow-400 to-amber-300 bg-clip-text text-transparent">
              Chatea con el asistente en tiempo real.
            </span>
          </h2>

          <p className="mt-5 text-pretty text-base leading-relaxed text-zinc-400">
            Elige el sector de tu negocio, selecciona preguntas frecuentes o{" "}
            <span className="font-semibold text-zinc-200">escribe tus propias dudas</span> en el chat.
            Mira cómo responde de forma natural, calcula precios y concreta pedidos al instante.
          </p>
        </div>

        {/* Sector Tabs Bar */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-2">
          {SECTORS.map((sector, index) => {
            const isSelected = activeSectorIndex === index;
            return (
              <button
                key={sector.id}
                type="button"
                onClick={() => handleSelectSector(index)}
                className={`group flex items-center gap-2.5 rounded-2xl px-4 py-2.5 text-xs font-medium transition-all ${
                  isSelected
                    ? "bg-yellow-400 text-zinc-950 font-semibold shadow-lg shadow-yellow-400/20 scale-[1.02]"
                    : "border border-white/10 bg-zinc-900/60 text-zinc-400 hover:border-white/20 hover:text-white backdrop-blur-md"
                }`}
              >
                <span className="text-sm">{sector.avatarIcon}</span>
                <span>{sector.name}</span>
                <span
                  className={`hidden sm:inline-block rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                    isSelected ? "bg-black/15 text-zinc-950" : "bg-white/5 text-zinc-500"
                  }`}
                >
                  {sector.badge}
                </span>
              </button>
            );
          })}
        </div>

        {/* Interactive Playground Grid */}
        <div className="mt-10 grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
          {/* LEFT: Realistic WhatsApp Phone Mockup */}
          <div className="relative mx-auto w-full max-w-[460px]">
            {/* Phone Bezel */}
            <div className="relative rounded-[2.5rem] border-4 border-zinc-800 bg-[#0b141a] p-3 shadow-[0_25px_80px_rgba(0,0,0,0.85)] ring-1 ring-white/15">
              {/* Top Speaker & Punch Hole */}
              <div className="absolute left-1/2 top-4 -translate-x-1/2 flex items-center gap-2 z-20">
                <div className="h-1 w-10 rounded-full bg-zinc-700" />
                <div className="size-2 rounded-full bg-zinc-800 ring-1 ring-zinc-700" />
              </div>

              {/* Screen Container */}
              <div className="overflow-hidden rounded-[2rem] bg-[#0b141a] border border-white/5 flex flex-col h-[580px]">
                {/* WhatsApp Chat Header */}
                <div className="flex items-center justify-between border-b border-white/10 bg-[#202c33] px-4 py-3 text-white">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="relative flex size-10 shrink-0 items-center justify-center rounded-full bg-zinc-700 text-lg">
                      {currentSector.avatarIcon}
                      <span className="absolute bottom-0 right-0 size-2.5 rounded-full bg-emerald-500 ring-2 ring-[#202c33]" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="truncate text-xs font-semibold text-zinc-100">
                          {currentSector.businessName}
                        </p>
                        <ShieldCheck className="size-3.5 shrink-0 text-emerald-400" />
                      </div>
                      <p className="text-[10px] text-emerald-400">
                        {isTyping ? "escribiendo..." : "En línea · Asistente IA"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={handleResetChat}
                      title="Reiniciar conversación"
                      className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white transition"
                    >
                      <RotateCcw className="size-4" />
                    </button>
                  </div>
                </div>

                {/* WhatsApp Wallpaper Messages Area */}
                <div
                  ref={chatContainerRef}
                  className="flex-1 overflow-y-auto p-4 space-y-3 bg-[radial-gradient(#ffffff05_1px,transparent_1px)] [background-size:16px_16px]"
                >
                  {/* Security / Encryption banner */}
                  <div className="mx-auto my-1 flex max-w-[280px] items-center justify-center rounded-lg bg-[#182229] px-3 py-1.5 text-center text-[10px] text-[#8696a0] shadow-sm">
                    🔒 Simulación interactiva con Inteligencia Artificial.
                  </div>

                  {messages.map((msg) => {
                    const isUser = msg.from === "user";
                    return (
                      <motion.div
                        key={msg.id}
                        initial={reduced ? false : { opacity: 0, y: 6, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{ duration: 0.2 }}
                        className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`relative max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed shadow-md ${
                            isUser
                              ? "bg-[#005c4b] text-white rounded-tr-none"
                              : "bg-[#202c33] text-zinc-200 rounded-tl-none border border-white/5"
                          }`}
                        >
                          <p className="whitespace-pre-wrap">{msg.text}</p>
                          <div className="mt-1 flex items-center justify-end gap-1 text-[9px] text-[#8696a0]">
                            <span>{msg.time}</span>
                            {isUser && <CheckCheck className="size-3 text-[#53bdeb]" />}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}

                  {/* Typing Indicator Bubble */}
                  <AnimatePresence>
                    {isTyping && (
                      <motion.div
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 6 }}
                        className="flex justify-start"
                      >
                        <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-none border border-white/5 bg-[#202c33] px-4 py-3 shadow-md">
                          {[0, 1, 2].map((dot) => (
                            <motion.span
                              key={dot}
                              className="size-1.5 rounded-full bg-emerald-400"
                              animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }}
                              transition={{
                                repeat: Infinity,
                                duration: 0.8,
                                delay: dot * 0.18,
                              }}
                            />
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Quick Prompts Carousel inside WhatsApp */}
                <div className="border-t border-white/5 bg-[#182229]/95 px-3 py-2">
                  <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-medium text-zinc-400">
                    <Sparkles className="size-3 text-yellow-300" />
                    <span>Preguntas de prueba rápida:</span>
                  </p>
                  <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                    {currentSector.quickPrompts.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => handleQuickPrompt(prompt)}
                        disabled={isTyping}
                        className="whitespace-nowrap rounded-lg border border-white/10 bg-[#202c33] px-2.5 py-1 text-[11px] text-zinc-300 hover:border-yellow-400/40 hover:text-white transition disabled:opacity-50"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Message Input Bar */}
                <form
                  onSubmit={handleSend}
                  className="flex items-center gap-2 border-t border-white/10 bg-[#202c33] p-2.5"
                >
                  <input
                    type="text"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder="Escribe tu mensaje aquí..."
                    disabled={isTyping}
                    className="flex-1 rounded-xl bg-[#2a3942] px-3.5 py-2.5 text-xs text-white placeholder:text-zinc-500 outline-none focus:ring-1 focus:ring-yellow-400/50"
                  />
                  <button
                    type="submit"
                    disabled={!inputText.trim() || isTyping}
                    aria-label="Enviar mensaje"
                    className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-yellow-400 text-zinc-950 transition hover:bg-yellow-300 disabled:opacity-40 disabled:cursor-not-allowed shadow-md shadow-yellow-400/10"
                  >
                    <Send className="size-4" />
                  </button>
                </form>
              </div>
            </div>
          </div>

          {/* RIGHT: Live Telemetry, Capabilities & Conversion Block */}
          <div className="space-y-6">
            {/* Live AI Engine Card */}
            <div className="cyber-card rounded-3xl border border-white/10 bg-gradient-to-b from-zinc-900/90 to-zinc-950/80 p-6 sm:p-7 backdrop-blur-xl shadow-2xl">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div className="flex items-center gap-2.5">
                  <div className="flex size-9 items-center justify-center rounded-xl bg-yellow-400/10 border border-yellow-400/20 text-yellow-300">
                    <Zap className="size-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white">Telemetría de la IA en Vivo</h3>
                    <p className="text-[11px] text-zinc-400">Análisis semántico en cada respuesta</p>
                  </div>
                </div>
                <span className="rounded-full bg-emerald-400/10 border border-emerald-400/20 px-2.5 py-1 text-[10px] font-medium text-emerald-400 flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full bg-emerald-400 animate-ping" />
                  MOTOR ACTIVO
                </span>
              </div>

              {/* Metrics Grid */}
              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-3.5">
                  <p className="text-[10px] uppercase tracking-wider text-zinc-500">Intención detectada</p>
                  <p className="mt-1 text-xs font-semibold text-yellow-300 truncate">
                    {currentSector.intentDetected}
                  </p>
                </div>

                <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-3.5">
                  <p className="text-[10px] uppercase tracking-wider text-zinc-500">Tiempo de respuesta</p>
                  <p className="mt-1 text-xs font-semibold text-emerald-400">
                    {(responseTimeMs / 1000).toFixed(2)}s promedio
                  </p>
                </div>

                <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-3.5">
                  <p className="text-[10px] uppercase tracking-wider text-zinc-500">Estado del prospecto</p>
                  <p className="mt-1 text-xs font-semibold text-zinc-200">
                    {currentSector.leadStatus}
                  </p>
                </div>

                <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-3.5">
                  <p className="text-[10px] uppercase tracking-wider text-zinc-500">Ahorro operativo</p>
                  <p className="mt-1 text-xs font-semibold text-zinc-200">
                    {currentSector.timeSaved}
                  </p>
                </div>
              </div>

              {/* What Nexo did in this chat */}
              <div className="mt-5 space-y-2.5 border-t border-white/5 pt-4">
                <p className="text-xs font-medium text-zinc-300">
                  ¿Por qué vende más que una respuesta automática típica?
                </p>
                {[
                  "No usa menús rígidos de 'presione 1 o 2'; entiende texto libre y modismos colombianos.",
                  "Calcula sumas, promociones y horarios disponibles sin equivocarse.",
                  "Si el cliente pide un asesor humano, transfiere el chat con un resumen listo.",
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-zinc-400">
                    <Check className="size-3.5 shrink-0 text-yellow-400 mt-0.5" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick Conversion CTA */}
            <div className="rounded-3xl border border-yellow-400/30 bg-gradient-to-r from-yellow-400/10 via-amber-400/5 to-transparent p-6 backdrop-blur-xl">
              <div className="flex items-center gap-2 text-xs font-semibold text-yellow-300">
                <Sparkles className="size-4" />
                <span>¿Quieres este mismo asistente en tu número de WhatsApp?</span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-zinc-400">
                Conéctalo en 5 minutos con tu catálogo, precios y horarios. Sin programar ni una sola línea de código.
              </p>
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <Link
                  href="/signup"
                  className="inline-flex items-center gap-2 rounded-xl bg-yellow-400 px-5 py-2.5 text-xs font-bold text-zinc-950 transition hover:bg-yellow-300 shadow-lg shadow-yellow-400/20"
                >
                  <span>Crear mi bot gratis</span>
                  <ArrowRight className="size-3.5" />
                </Link>
                <a
                  href="#precios"
                  className="rounded-xl border border-white/10 px-4 py-2.5 text-xs font-medium text-zinc-300 hover:bg-white/5 hover:text-white transition"
                >
                  Ver planes desde $49.000 COP
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
