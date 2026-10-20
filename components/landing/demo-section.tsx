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
    id: "moda",
    badge: "Moda",
    name: "Moda & Ropa",
    businessName: "Aura Concept Store",
    avatarIcon: "🛍️",
    description: "Recomienda prendas del catálogo, verifica tallas en stock y deja el pedido listo para pagar.",
    quickPrompts: [
      "¿Qué tallas tienen de la chaqueta?",
      "¿Hacen envíos a Medellín o Cali?",
      "¿Tienen cambio si no me queda?",
      "La quiero, ¿cómo pago?",
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
        text: "¡Hola! Sí, nos quedan 3 unidades en talla M en color negro. Su valor es $149.000 COP 🖤. ¿Te separo una?",
        time: "11:40 am",
      },
    ],
    responses: {
      "talla": "Tenemos la chaqueta en S (2), M (3) y L (1) en stock. Te comparto la guía de medidas para que elijas la ideal.",
      "envio": "Enviamos a todo Colombia: a ciudades principales llega en 24 a 48 horas hábiles. Dime tu ciudad y te calculo el envío exacto.",
      "cambio": "Sí, tienes 30 días para cambiar por talla o referencia, siempre que la prenda esté sin uso y con etiquetas.",
      "pago": "Perfecto. Te dejo el pedido: 1 × Chaqueta bomber negra M, $149.000 COP + envío. Puedes pagar por link de pago, transferencia o Nequi. ¿Cuál prefieres?",
      "precio": "La chaqueta bomber vale $149.000 COP. Si llevas dos prendas del catálogo, el envío te sale gratis.",
    },
    defaultResponse: "Listo. ¿Me compartes tu nombre, ciudad y dirección para calcular el envío y dejar el pedido listo?",
    leadStatus: "Pedido listo para pagar",
    intentDetected: "Consulta de talla & cierre",
    timeSaved: "15 min de atención manual",
  },
  {
    id: "calzado",
    badge: "Calzado",
    name: "Calzado & Accesorios",
    businessName: "Paso Firme Sneakers",
    avatarIcon: "👟",
    description: "Revisa talla y color por variante, envía la foto del producto y cotiza el envío a la ciudad del cliente.",
    quickPrompts: [
      "¿Los tienen en talla 40?",
      "¿Me mandas una foto en blanco?",
      "¿Cuánto vale el envío a Cali?",
      "Sí, confirmo el pedido",
    ],
    initialMessages: [
      {
        id: "c1",
        from: "user",
        text: "Buenas, ¿cuánto valen los tenis urbanos que publicaron ayer?",
        time: "7:15 pm",
      },
      {
        id: "c2",
        from: "bot",
        text: "¡Hola! Los Urban Runner valen $189.000 COP. Los tenemos en negro y blanco, tallas 37 a 42. ¿Qué talla usas?",
        time: "7:15 pm",
      },
    ],
    responses: {
      "talla": "En talla 40 hay 2 pares en negro y 1 en blanco. ¿Cuál color te separo?",
      "foto": "¡Claro! Te envío la foto de los Urban Runner en blanco 📸. Son de suela antideslizante y plantilla acolchada.",
      "envio": "El envío a Cali vale $12.000 COP y llega en 2 días hábiles. Total: $201.000 COP. ¿Te dejo el pedido así?",
      "confirmo": "¡Pedido confirmado! 1 × Urban Runner blanco talla 40, total $201.000 COP. Te envío el link de pago; apenas se acredite, despachamos.",
      "precio": "Los Urban Runner valen $189.000 COP y los Classic Low $159.000 COP.",
    },
    defaultResponse: "Con gusto. ¿Qué talla y color buscas? Reviso el stock exacto antes de separarlos.",
    leadStatus: "Pedido confirmado · pendiente de pago",
    intentDetected: "Variante, envío & checkout",
    timeSaved: "12 min por cada venta",
  },
  {
    id: "tecnologia",
    badge: "Tecnología",
    name: "Tecnología & Gadgets",
    businessName: "Voltio Tech Store",
    avatarIcon: "🎧",
    description: "Responde dudas técnicas con tu catálogo, explica la garantía y ofrece pago contraentrega o por link.",
    quickPrompts: [
      "¿Qué garantía tienen los audífonos?",
      "¿Son compatibles con iPhone?",
      "¿Puedo pagar contraentrega?",
      "¿Tienen stock del cargador de 20W?",
    ],
    initialMessages: [
      {
        id: "g1",
        from: "user",
        text: "Hola, ¿todavía tienen los audífonos inalámbricos con cancelación de ruido?",
        time: "9:05 pm",
      },
      {
        id: "g2",
        from: "bot",
        text: "¡Hola! Sí, los Pulse ANC están disponibles a $219.000 COP, con hasta 30 horas de batería. ¿Te cuento cómo es la garantía?",
        time: "9:05 pm",
      },
    ],
    responses: {
      "garantia": "Tienen 6 meses de garantía por defectos de fábrica. Si algo falla, nos escribes por aquí y gestionamos el cambio.",
      "compatible": "Sí, se conectan por Bluetooth 5.3 con iPhone, Android y computador.",
      "contraentrega": "Sí, en ciudades principales recibimos contraentrega. También puedes pagar por link de pago o transferencia. ¿A qué ciudad te lo enviamos?",
      "stock": "Del cargador de 20W quedan 8 unidades, a $59.000 COP. Si lo llevas con los audífonos, el envío es gratis.",
      "precio": "Los Pulse ANC valen $219.000 COP y el cargador de 20W $59.000 COP.",
    },
    defaultResponse: "Te ayudo. ¿Lo quieres para iPhone o Android? Así te recomiendo el accesorio correcto del catálogo.",
    leadStatus: "Venta calificada",
    intentDetected: "Consulta técnica & cierre",
    timeSaved: "18 min de soporte preventa",
  },
  {
    id: "mayorista",
    badge: "Al por mayor",
    name: "Ventas al por mayor",
    businessName: "Distribuidora Andina",
    avatarIcon: "📦",
    description: "Aplica precio mayorista desde la cantidad mínima, calcula el total del pedido y envía los datos de pago.",
    quickPrompts: [
      "¿Desde cuántas unidades es precio mayorista?",
      "Quiero 24 unidades surtidas",
      "¿Cómo es el pago por transferencia?",
      "¿Cuánto tarda el despacho?",
    ],
    initialMessages: [
      {
        id: "w1",
        from: "user",
        text: "Buenos días, tengo una tienda y quiero comprar camisetas básicas para revender.",
        time: "8:30 am",
      },
      {
        id: "w2",
        from: "bot",
        text: "¡Hola! Con gusto 🙌. La camiseta básica vale $28.000 COP al detal y $19.500 COP al por mayor. ¿Cuántas unidades necesitas?",
        time: "8:30 am",
      },
    ],
    responses: {
      "mayorista": "El precio mayorista aplica desde 12 unidades, y puedes surtir tallas y colores en el mismo pedido.",
      "24": "Anotado: 24 camisetas básicas a $19.500 COP = $468.000 COP. ¿Me indicas las tallas y colores, y la ciudad de despacho?",
      "transferencia": "Te envío los datos de la cuenta para la transferencia. Cuando nos compartas el comprobante, el pedido pasa a despacho.",
      "despacho": "Despachamos en 24 horas hábiles después de confirmar el pago. A ciudades principales llega en 2 a 3 días.",
      "precio": "Detal: $28.000 COP. Al por mayor (desde 12 unidades): $19.500 COP por unidad.",
    },
    defaultResponse: "Perfecto. Dime cantidades por talla y color, y te armo el pedido con el total exacto.",
    leadStatus: "Pedido mayorista en curso",
    intentDetected: "Cotización mayorista",
    timeSaved: "25 min armando cotizaciones",
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
    // Sin tildes, para que "envíos" coincida con la palabra clave "envio".
    const lower = userPrompt.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

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
            Elige el tipo de tienda, selecciona preguntas frecuentes o{" "}
            <span className="font-semibold text-zinc-200">escribe como lo haría tu cliente</span> en el chat.
            Mira cómo responde por tallas, stock y envíos, y deja el pedido listo para pagar.
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

              {/* What Zorax did in this chat */}
              <div className="mt-5 space-y-2.5 border-t border-white/5 pt-4">
                <p className="text-xs font-medium text-zinc-300">
                  ¿Por qué vende más que una respuesta automática típica?
                </p>
                {[
                  "No usa menús rígidos de 'presione 1 o 2'; entiende texto libre y modismos colombianos.",
                  "Consulta stock, envío y totales con los datos de tu catálogo.",
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
                Conéctalo con tu catálogo, stock y envíos. Sin programar ni una sola línea de código.
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
                  Ver planes desde $120.000 COP
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
