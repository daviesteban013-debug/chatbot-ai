"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowUp,
  Bot,
  CheckCircle2,
  Loader2,
  MapPin,
  Palette,
  Percent,
  ScrollText,
  ShoppingBag,
  Sparkles,
  Store,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn, formatCOP } from "@/lib/utils";
import { saveOnboardingData } from "./actions";

// ---------- Tipos ----------
type AnswerKey =
  | "businessName"
  | "businessType"
  | "city"
  | "agentName"
  | "agentTone"
  | "maxDiscountPct"
  | "autoConfirmMaxTotal"
  | "businessRules";

type Answers = {
  businessName: string;
  businessType: string;
  city: string;
  agentName: string;
  agentTone: string;
  maxDiscountPct: number;
  autoConfirmMaxTotal: number;
  businessRules: string;
};

type Sender = "jarvis" | "user";
type Message = { id: string; sender: Sender; text: string };
type Phase = "thinking" | "asking" | "saving" | "done";
type Kind = "text" | "chips-text" | "choice" | "slider" | "money" | "textarea";

type Question = {
  key: AnswerKey;
  kind: Kind;
  text: string;
  placeholder?: string;
  chips?: string[];
  moneyChips?: number[];
  skipLabel?: string;
  slider?: { min: number; max: number; step: number; default: number };
  icon: LucideIcon;
};

// ---------- Preguntas del flujo ----------
const QUESTIONS: Question[] = [
  {
    key: "businessName",
    kind: "text",
    text: "¡Hola! Soy NEXO, tu asistente de configuración 🤖 Empecemos: ¿cómo se llama tu negocio?",
    placeholder: "Ej. Bellisima, Barbería El Fade…",
    icon: Store,
  },
  {
    key: "businessType",
    kind: "chips-text",
    text: "¡Genial! ¿Qué tipo de productos o servicios vendes?",
    placeholder: "Escribe otra categoría…",
    chips: [
      "Ropa y moda",
      "Comida y bebidas",
      "Tecnología",
      "Belleza",
      "Servicios",
      "Hogar y decoración",
    ],
    icon: ShoppingBag,
  },
  {
    key: "city",
    kind: "chips-text",
    text: "¿En qué ciudad o departamento de Colombia operas principalmente?",
    placeholder: "Ej. Envigado, Antioquia…",
    chips: ["Bogotá", "Medellín", "Cali", "Barranquilla", "Cartagena", "Bucaramanga"],
    icon: MapPin,
  },
  {
    key: "agentName",
    kind: "text",
    text: "Ahora la parte divertida: ¿cómo quieres que se llame tu agente de ventas?",
    placeholder: "Ej. Vale, Nexo, Lía…",
    icon: Sparkles,
  },
  {
    key: "agentTone",
    kind: "choice",
    text: "¿Qué tono prefieres para tu agente?",
    chips: ["Amable", "Profesional", "Casual", "Divertido"],
    icon: Palette,
  },
  {
    key: "maxDiscountPct",
    kind: "slider",
    text: "¿Cuál es el máximo de descuento que tu agente puede ofrecer sin consultarte?",
    slider: { min: 0, max: 40, step: 1, default: 10 },
    icon: Percent,
  },
  {
    key: "autoConfirmMaxTotal",
    kind: "money",
    text: "¿Hasta qué monto (en pesos) puede confirmar pedidos automáticamente? Con $0 siempre te consultará antes.",
    moneyChips: [0, 100000, 200000, 300000, 500000],
    icon: Wallet,
  },
  {
    key: "businessRules",
    kind: "textarea",
    text: "Y por último: ¿tienes reglas especiales? (horarios, políticas de envío, cambios o devoluciones)",
    placeholder: "Ej. Envío gratis desde $150.000. Cambios hasta 5 días hábiles…",
    skipLabel: "Sin reglas por ahora",
    icon: ScrollText,
  },
];

const TOTAL = QUESTIONS.length;

const FINAL_MESSAGE =
  "¡Perfecto! Ya tengo todo lo que necesito. Tu agente está listo para empezar en modo shadow: observa y propone, pero no envía nada sin tu aprobación. ¡Vamos al panel! 🚀";

const delay = (ms: number) => new Promise<void>((res) => setTimeout(res, ms));

/** Formatea la respuesta del usuario para mostrarla en su burbuja. */
function formatAnswer(key: AnswerKey, value: string | number): string {
  switch (key) {
    case "maxDiscountPct":
      return Number(value) === 0
        ? "Sin descuentos automáticos"
        : `Hasta ${value}% de descuento`;
    case "autoConfirmMaxTotal":
      return Number(value) === 0
        ? "Siempre requiere mi aprobación"
        : `Confirmar solo hasta ${formatCOP(Number(value))}`;
    case "businessRules":
      return value ? String(value) : "Sin reglas especiales por ahora";
    default:
      return String(value);
  }
}

export function OnboardingChat() {
  const router = useRouter();

  const [messages, setMessages] = useState<Message[]>([]);
  const [stepIndex, setStepIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("thinking");
  const [answered, setAnswered] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Estado de los inputs del compositor.
  const [text, setText] = useState("");
  const [slider, setSlider] = useState(QUESTIONS[5].slider!.default);
  const [money, setMoney] = useState("");

  const answersRef = useRef<Partial<Answers>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const idRef = useRef(0);
  const startedRef = useRef(false);
  // Cerrojo síncrono: evita que un doble clic avance el flujo dos veces
  // (los setState son asíncronos y el guard por `phase` leería valor viejo).
  const lockRef = useRef(false);

  const pushMessage = useCallback((sender: Sender, text: string) => {
    idRef.current += 1;
    const id = `m${idRef.current}`;
    setMessages((prev) => [...prev, { id, sender, text }]);
  }, []);

  // Mensaje inicial de Jarvis.
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    (async () => {
      await delay(550);
      pushMessage("jarvis", QUESTIONS[0].text);
      setPhase("asking");
    })();
  }, [pushMessage]);

  // Auto-scroll al crecer la conversación.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, phase]);

  /** Procesa una respuesta, avanza el flujo y persiste al final. */
  const submitAnswer = useCallback(
    async (raw: string | number) => {
      if (phase !== "asking" || lockRef.current) return;
      const q = QUESTIONS[stepIndex];
      if (!q) return;

      const isNumeric = q.kind === "slider" || q.kind === "money";
      const trimmed = typeof raw === "string" ? raw.trim() : raw;

      // Validación mínima: texto vacío solo se permite en textarea (skip).
      if (typeof trimmed === "string" && trimmed.length === 0 && q.kind !== "textarea") {
        return;
      }

      const value: string | number = isNumeric ? Number(trimmed) : String(trimmed);
      if (isNumeric && Number.isNaN(value)) return;

      lockRef.current = true;
      answersRef.current = { ...answersRef.current, [q.key]: value };
      pushMessage("user", formatAnswer(q.key, value));
      setText("");
      setMoney("");
      setError(null);
      setAnswered((a) => a + 1);

      const isLast = stepIndex === TOTAL - 1;
      setPhase("thinking");
      await delay(680);

      if (!isLast) {
        const next = stepIndex + 1;
        setStepIndex(next);
        pushMessage("jarvis", QUESTIONS[next].text);
        setPhase("asking");
        lockRef.current = false;
        return;
      }

      // Última pregunta -> guardar todo en la BD.
      setPhase("saving");
      const a = answersRef.current as Answers;
      const result = await saveOnboardingData({
        businessName: a.businessName,
        businessType: a.businessType,
        city: a.city,
        agentName: a.agentName,
        agentTone: a.agentTone,
        maxDiscountPct: Number(a.maxDiscountPct),
        autoConfirmMaxTotal: Number(a.autoConfirmMaxTotal),
        businessRules: a.businessRules ?? "",
      });

      if (result.ok) {
        setPhase("done");
        setAnswered(TOTAL);
        pushMessage("jarvis", FINAL_MESSAGE);
        await delay(2200);
        router.replace("/dashboard/jarvis");
        router.refresh();
      } else {
        setError(result.error ?? "Algo salió mal. Inténtalo de nuevo.");
        setAnswered((x) => Math.max(0, x - 1));
        pushMessage("jarvis", QUESTIONS[stepIndex].text);
        setPhase("asking");
        lockRef.current = false;
      }
    },
    [phase, stepIndex, pushMessage, router]
  );

  const current = QUESTIONS[stepIndex];
  const progress = Math.round((answered / TOTAL) * 100);
  const isBusy = phase === "thinking" || phase === "saving";

  return (
    <div className="mx-auto flex h-svh w-full max-w-2xl flex-col px-3 sm:px-4">
      {/* ---------- Encabezado ---------- */}
      <header className="shrink-0 pt-5 pb-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-xl bg-slate-950 text-yellow-400 shadow-lg shadow-slate-900/20 ring-1 ring-slate-900/10">
              <Bot className="size-5" strokeWidth={2.2} />
            </span>
            <div className="leading-tight">
              <p className="font-[family-name:var(--font-display)] text-[15px] font-extrabold tracking-tight text-slate-950">
                Configura tu asistente
              </p>
              <p className="flex items-center gap-1.5 text-[11px] text-slate-500">
                <span className="size-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,.9)]" />
                NEXO está en línea
              </p>
            </div>
          </div>

          <div className="text-right">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              {phase === "done" ? "¡Listo!" : `Paso ${Math.min(stepIndex + 1, TOTAL)} de ${TOTAL}`}
            </p>
            <div className="mt-1.5 h-1.5 w-24 overflow-hidden rounded-full bg-slate-200/80 sm:w-32">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-yellow-300 to-amber-500"
                initial={false}
                animate={{ width: `${progress}%` }}
                transition={{ type: "spring", stiffness: 120, damping: 20 }}
              />
            </div>
          </div>
        </div>
      </header>

      {/* ---------- Conversación ---------- */}
      <div
        ref={scrollRef}
        className="flex-1 space-y-4 overflow-y-auto py-4 [scrollbar-width:thin]"
        aria-live="polite"
      >
        <AnimatePresence initial={false}>
          {messages.map((m) => (
            <Bubble key={m.id} message={m} />
          ))}
        </AnimatePresence>

        {isBusy ? <TypingBubble /> : null}
      </div>

      {/* ---------- Compositor ---------- */}
      <div className="shrink-0 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
        {error ? (
          <motion.p
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700"
          >
            {error}
          </motion.p>
        ) : null}

        <AnimatePresence mode="wait">
          {phase === "asking" && current ? (
            <motion.div
              key={current.key}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.28, ease: "easeOut" }}
            >
              <Composer
                question={current}
                text={text}
                setText={setText}
                slider={slider}
                setSlider={setSlider}
                money={money}
                setMoney={setMoney}
                onSubmit={submitAnswer}
              />
            </motion.div>
          ) : phase === "done" ? (
            <motion.div
              key="done"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center justify-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50/80 px-4 py-4 text-sm font-medium text-emerald-700 backdrop-blur"
            >
              <CheckCircle2 className="size-5" />
              Entrando a tu panel…
            </motion.div>
          ) : (
            <motion.div
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center justify-center gap-2 rounded-2xl border border-white/70 bg-white/70 px-4 py-4 text-sm text-slate-400 backdrop-blur"
            >
              <Loader2 className="size-4 animate-spin" />
              {phase === "saving"
                ? "Guardando tu configuración…"
                : "NEXO está escribiendo…"}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// =====================================================================
// Compositor: input adaptativo según el tipo de pregunta.
// =====================================================================
function Composer({
  question,
  text,
  setText,
  slider,
  setSlider,
  money,
  setMoney,
  onSubmit,
}: {
  question: Question;
  text: string;
  setText: (v: string) => void;
  slider: number;
  setSlider: (v: number) => void;
  money: string;
  setMoney: (v: string) => void;
  onSubmit: (raw: string | number) => void | Promise<void>;
}) {
  const Icon = question.icon;

  function handleForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit(text);
  }

  function handleTextareaKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      onSubmit(text);
    }
  }

  function handleMoney(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const n = parseInt(money.replace(/\D/g, ""), 10);
    if (Number.isNaN(n)) return;
    onSubmit(n);
  }

  return (
    <div className="rounded-2xl border border-white/70 bg-white/85 p-3 shadow-xl shadow-slate-500/20 ring-1 ring-slate-900/5 backdrop-blur-xl">
      {/* Etiqueta con icono de la pregunta */}
      <div className="mb-2.5 flex items-center gap-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        <Icon className="size-3.5 text-yellow-500" />
        {labelFor(question.key)}
      </div>

      {/* --- Texto simple --- */}
      {question.kind === "text" ? (
        <form onSubmit={handleForm} className="flex items-center gap-2">
          <Input
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={question.placeholder}
            className="h-12 rounded-xl border-slate-200 text-[15px]"
            aria-label={labelFor(question.key)}
          />
          <SendButton disabled={!text.trim()} />
        </form>
      ) : null}

      {/* --- Chips + texto libre --- */}
      {question.kind === "chips-text" ? (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {question.chips?.map((chip) => (
              <Chip key={chip} onClick={() => onSubmit(chip)}>
                {chip}
              </Chip>
            ))}
          </div>
          <form onSubmit={handleForm} className="flex items-center gap-2">
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={question.placeholder}
              className="h-12 rounded-xl border-slate-200 text-[15px]"
              aria-label={labelFor(question.key)}
            />
            <SendButton disabled={!text.trim()} />
          </form>
        </div>
      ) : null}

      {/* --- Solo chips (selección) --- */}
      {question.kind === "choice" ? (
        <div className="grid grid-cols-2 gap-2">
          {question.chips?.map((chip) => (
            <Chip key={chip} onClick={() => onSubmit(chip)} className="justify-center py-3 text-[15px]">
              {chip}
            </Chip>
          ))}
        </div>
      ) : null}

      {/* --- Slider de descuento --- */}
      {question.kind === "slider" ? (
        <div className="px-1 pb-1">
          <div className="mb-3 flex items-end justify-between">
            <span className="font-[family-name:var(--font-display)] text-4xl font-extrabold tracking-tight text-slate-950">
              {slider}
              <span className="text-2xl text-yellow-500">%</span>
            </span>
            <span className="pb-1 text-xs text-slate-400">
              {slider === 0 ? "Sin descuentos" : "máx. sin consultar"}
            </span>
          </div>
          <input
            type="range"
            min={question.slider!.min}
            max={question.slider!.max}
            step={question.slider!.step}
            value={slider}
            onChange={(e) => setSlider(Number(e.target.value))}
            className="h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-yellow-500"
            aria-label="Descuento máximo"
          />
          <div className="mt-4">
            <ConfirmButton onClick={() => onSubmit(slider)}>Confirmar {slider}%</ConfirmButton>
          </div>
        </div>
      ) : null}

      {/* --- Monto de confirmación automática --- */}
      {question.kind === "money" ? (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {question.moneyChips?.map((v) => (
              <Chip key={v} onClick={() => onSubmit(v)}>
                {v === 0 ? "Siempre consultar" : formatCOP(v)}
              </Chip>
            ))}
          </div>
          <form onSubmit={handleMoney} className="flex items-center gap-2">
            <div className="relative flex-1">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[15px] font-medium text-slate-400">
                $
              </span>
              <Input
                value={money}
                onChange={(e) => setMoney(e.target.value)}
                inputMode="numeric"
                placeholder="Otro monto…"
                className="h-12 rounded-xl border-slate-200 pl-8 text-[15px]"
                aria-label="Monto de confirmación automática"
              />
            </div>
            <SendButton disabled={!money.trim()} />
          </form>
        </div>
      ) : null}

      {/* --- Texto largo (reglas) --- */}
      {question.kind === "textarea" ? (
        <div className="space-y-3">
          <Textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleTextareaKey}
            placeholder={question.placeholder}
            rows={3}
            className="rounded-xl border-slate-200 text-[15px] leading-6"
            aria-label={labelFor(question.key)}
          />
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => onSubmit("")}
              className="rounded-lg px-2 py-1.5 text-xs font-medium text-slate-500 transition hover:text-slate-800"
            >
              {question.skipLabel}
            </button>
            <ConfirmButton onClick={() => onSubmit(text)} disabled={!text.trim()}>
              Guardar y terminar
            </ConfirmButton>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// =====================================================================
// Piezas de UI
// =====================================================================

function labelFor(key: AnswerKey): string {
  const map: Record<AnswerKey, string> = {
    businessName: "Nombre del negocio",
    businessType: "Qué vendes",
    city: "Ubicación",
    agentName: "Nombre del agente",
    agentTone: "Tono",
    maxDiscountPct: "Descuento máximo",
    autoConfirmMaxTotal: "Confirmación automática",
    businessRules: "Reglas del negocio",
  };
  return map[key];
}

function Chip({
  children,
  onClick,
  className,
}: {
  children: React.ReactNode;
  onClick: () => void;
  className?: string;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.96 }}
      className={cn(
        "inline-flex items-center rounded-full border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700",
        "shadow-sm transition-colors hover:border-yellow-400 hover:bg-yellow-50 hover:text-slate-900",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400/60",
        className
      )}
    >
      {children}
    </motion.button>
  );
}

function SendButton({ disabled }: { disabled: boolean }) {
  return (
    <button
      type="submit"
      disabled={disabled}
      aria-label="Enviar respuesta"
      className={cn(
        "flex size-12 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-yellow-400 transition",
        "hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
      )}
    >
      <ArrowUp className="size-5" strokeWidth={2.5} />
    </button>
  );
}

function ConfirmButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 text-sm font-semibold text-white transition",
        "hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400/60 focus-visible:ring-offset-2"
      )}
    >
      {children}
    </button>
  );
}

function Bubble({ message }: { message: Message }) {
  const isJarvis = message.sender === "jarvis";
  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: 14, x: isJarvis ? -8 : 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, x: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 260, damping: 26 }}
      className={cn("flex items-end gap-2.5", isJarvis ? "justify-start" : "justify-end")}
    >
      {isJarvis ? <JarvisAvatar /> : null}

      <div className={cn("max-w-[82%] sm:max-w-[75%]", isJarvis ? "" : "order-1")}>
        {isJarvis ? (
          <p className="mb-1 ml-1 text-[11px] font-semibold text-slate-400">NEXO</p>
        ) : null}
        <div
          className={cn(
            "whitespace-pre-wrap px-4 py-3 text-[15px] leading-relaxed shadow-sm",
            isJarvis
              ? "rounded-2xl rounded-bl-md bg-slate-900 text-slate-100 shadow-slate-900/20"
              : "rounded-2xl rounded-br-md border border-slate-200 bg-white text-slate-800"
          )}
        >
          {message.text}
        </div>
      </div>
    </motion.div>
  );
}

function JarvisAvatar() {
  return (
    <span className="relative mb-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-slate-800 to-slate-950 text-yellow-400 shadow-lg shadow-slate-900/25 ring-1 ring-white/10">
      <span className="absolute inset-0 rounded-xl bg-yellow-400/10 blur-md" />
      <Bot className="relative size-5" strokeWidth={2} />
      <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full border-2 border-slate-100 bg-emerald-400" />
    </span>
  );
}

function TypingBubble({ label }: { label?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="flex items-end gap-2.5"
    >
      <JarvisAvatar />
      <div className="rounded-2xl rounded-bl-md bg-slate-900 px-4 py-3 shadow-sm shadow-slate-900/20">
        <div className="flex items-center gap-2.5">
          <span className="flex items-center gap-1">
            {[0, 1, 2].map((i) => (
              <motion.span
                key={i}
                className="size-1.5 rounded-full bg-slate-400"
                animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }}
                transition={{ duration: 1, repeat: Infinity, delay: i * 0.18 }}
              />
            ))}
          </span>
          {label ? <span className="text-xs text-slate-400">{label}…</span> : null}
        </div>
      </div>
    </motion.div>
  );
}
