"use client";

import { Sparkles, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

export type BotStyle = "preset" | "custom";

interface StyleSegmentedControlProps {
  value: BotStyle;
  onChange: (style: BotStyle) => void;
}

const segments: {
  id: BotStyle;
  label: string;
  icon: typeof Sparkles;
}[] = [
  { id: "preset", label: "Predeterminado por nicho", icon: Sparkles },
  { id: "custom", label: "Personalizado", icon: SlidersHorizontal },
];

export function StyleSegmentedControl({
  value,
  onChange,
}: StyleSegmentedControlProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Estilo del bot"
      className="inline-flex w-full max-w-md items-center gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1"
    >
      {segments.map((segment) => {
        const Icon = segment.icon;
        const active = value === segment.id;
        return (
          <button
            key={segment.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(segment.id)}
            className={cn(
              "inline-flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium",
              "transition-colors duration-150",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-1",
              active
                ? "bg-slate-900 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-200/70 hover:text-slate-900"
            )}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="truncate">{segment.label}</span>
          </button>
        );
      })}
    </div>
  );
}
