"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Info, CircleAlert } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { agentProfile } from "@/lib/mock-data";
import type { AgentProfile } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  StyleSegmentedControl,
  type BotStyle,
} from "./style-segmented-control";

type Tone = AgentProfile["tone"];

interface FormState {
  botName: string;
  style: BotStyle;
  niche: string;
  tone: Tone;
  businessRules: string;
}

const toneOptions: { value: Tone; label: string }[] = [
  { value: "friendly", label: "Cercano" },
  { value: "professional", label: "Profesional" },
  { value: "casual", label: "Casual" },
  { value: "formal", label: "Formal" },
];

const baseNiches = [
  "Restaurante y cafetería",
  "Salón de belleza",
  "Clínica dental",
  "Tienda de ropa",
  "Gimnasio y estudio fitness",
  "Servicios profesionales",
];

type SaveStatus = "idle" | "saving" | "saved";

function initialState(): FormState {
  return {
    botName: agentProfile.botName,
    style: agentProfile.style,
    niche: agentProfile.niche,
    tone: agentProfile.tone,
    businessRules: agentProfile.businessRules,
  };
}

export function AssistantForm() {
  const [form, setForm] = useState<FormState>(initialState);
  const [savedSnapshot, setSavedSnapshot] = useState<FormState>(initialState);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  const isDirty = JSON.stringify(form) !== JSON.stringify(savedSnapshot);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSave() {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    setSaveStatus("saving");
    saveTimerRef.current = setTimeout(() => {
      setSavedSnapshot(form);
      setSaveStatus("saved");
      hideTimerRef.current = setTimeout(() => setSaveStatus("idle"), 4000);
    }, 600);
  }

  const nicheOptions = baseNiches.includes(form.niche)
    ? baseNiches
    : [form.niche, ...baseNiches];

  return (
    <div className="flex flex-col gap-6">
      {/* Encabezado */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900">
            Mi Asistente
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Configura cómo responde tu asistente de IA en WhatsApp.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {saveStatus === "saved" && !isDirty && (
            <Badge variant="success">
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              Cambios guardados correctamente
            </Badge>
          )}
          {isDirty && saveStatus !== "saving" && (
            <Badge variant="warning">
              <CircleAlert className="h-3.5 w-3.5" aria-hidden="true" />
              Cambios sin guardar
            </Badge>
          )}
        </div>
      </header>

      {/* Identidad y estilo */}
      <Card>
        <CardHeader>
          <CardTitle>Identidad y estilo</CardTitle>
          <CardDescription>
            Define el nombre, el estilo y el tono con el que tu asistente
            hablará con tus clientes.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {/* Nombre del bot */}
          <div className="flex flex-col gap-2">
            <label
              htmlFor="bot-name"
              className="text-sm font-medium text-slate-900"
            >
              Nombre del bot
            </label>
            <Input
              id="bot-name"
              value={form.botName}
              onChange={(e) => update("botName", e.target.value)}
              placeholder="Ej. Aurora"
              className="max-w-md"
            />
            <p className="text-xs text-slate-500">
              Así se presentará tu asistente en las conversaciones de WhatsApp.
            </p>
          </div>

          {/* Estilo del bot */}
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-slate-900">
              Estilo del bot
            </span>
            <StyleSegmentedControl
              value={form.style}
              onChange={(style) => update("style", style)}
            />

            {form.style === "preset" ? (
              <div className="mt-2 flex flex-col gap-2">
                <label
                  htmlFor="niche"
                  className="text-sm font-medium text-slate-900"
                >
                  Nicho del negocio
                </label>
                <Select
                  id="niche"
                  value={form.niche}
                  onChange={(e) => update("niche", e.target.value)}
                  className="max-w-md"
                >
                  {nicheOptions.map((niche) => (
                    <option key={niche} value={niche}>
                      {niche}
                    </option>
                  ))}
                </Select>
                <p className="flex items-start gap-1.5 text-xs text-slate-500">
                  <Info
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-500"
                    aria-hidden="true"
                  />
                  Tu asistente usará las reglas y respuestas predeterminadas
                  del nicho seleccionado.
                </p>
              </div>
            ) : (
              <p className="mt-2 flex items-start gap-1.5 text-xs text-slate-500">
                <Info
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-500"
                  aria-hidden="true"
                />
                Modo personalizado activo: edita tus propias reglas de negocio
                y catálogo en el apartado de abajo.
              </p>
            )}
          </div>

          {/* Tono */}
          <div className="flex flex-col gap-2">
            <label
              htmlFor="tone"
              className="text-sm font-medium text-slate-900"
            >
              Tono
            </label>
            <Select
              id="tone"
              value={form.tone}
              onChange={(e) => update("tone", e.target.value as Tone)}
              className="max-w-md"
            >
              {toneOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Reglas de negocio */}
      <Card>
        <CardHeader>
          <CardTitle id="business-rules-label">
            Reglas de Negocio / Catálogo
          </CardTitle>
          <CardDescription>
            Describe tu menú/servicios, precios, horarios, políticas de
            reserva, etc.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Textarea
            id="business-rules"
            aria-labelledby="business-rules-label"
            rows={12}
            value={form.businessRules}
            onChange={(e) => update("businessRules", e.target.value)}
            disabled={form.style === "preset"}
            placeholder="Ej. Horario de atención, monto mínimo de pedidos a domicilio, cómo confirmar una reserva..."
            className={cn(form.style === "preset" && "bg-slate-50")}
          />
          {form.style === "preset" && (
            <p className="text-xs text-slate-500">
              Estás usando el estilo predeterminado por nicho. Cambia a
              &quot;Personalizado&quot; para editar tus propias reglas.
            </p>
          )}
        </CardContent>
        <CardFooter className="flex-col items-stretch gap-3 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-h-6 text-sm" role="status" aria-live="polite">
            {saveStatus === "saved" && !isDirty ? (
              <span className="inline-flex items-center gap-1.5 text-emerald-700">
                <Check className="h-4 w-4" aria-hidden="true" />
                Cambios guardados correctamente
              </span>
            ) : isDirty && saveStatus !== "saving" ? (
              <span className="inline-flex items-center gap-1.5 text-amber-600">
                <CircleAlert className="h-4 w-4" aria-hidden="true" />
                Tienes cambios sin guardar
              </span>
            ) : null}
          </div>
          <Button
            onClick={handleSave}
            disabled={saveStatus === "saving"}
            className="w-full sm:w-auto"
          >
            {saveStatus === "saving" ? (
              <>
                <Loader2
                  className="h-4 w-4 animate-spin"
                  aria-hidden="true"
                />
                Guardando...
              </>
            ) : (
              "Guardar Cambios"
            )}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
