"use client";
import Link from "next/link";
import { Zap } from "lucide-react";
import { Panel, PanelHeader } from "@/components/dashboard/panel";
import { useAutomationSuggestions } from "@/hooks/useAutomationSuggestions";
import { SUGGESTION_TEXTS } from "@/lib/suggestions";

/** Owner's home: switches NEXO suggests because the team keeps confirming that work by hand. */
export function HomeSuggestions({ enabled }: { enabled: boolean }) {
  const state = useAutomationSuggestions(enabled);
  if (!enabled || (!state.suggestions.length && !state.notice)) return null;
  return (
    <Panel aria-labelledby="suggestions-title">
      <PanelHeader id="suggestions-title" title="NEXO podría hacerlo solo" description="Basado en lo que tu equipo confirmó a mano en los últimos 30 días. Cada acción automática se puede deshacer durante 7 días." />
      {state.notice && <p role="status" className="border-b border-line bg-emerald-50 px-4 py-2.5 text-xs text-emerald-800 sm:px-5">{state.notice} <Link href="/dashboard/agent#autonomia" className="underline underline-offset-2">Ver autonomía</Link></p>}
      <ul className="divide-y divide-line">
        {state.suggestions.map(suggestion => {
          const text = SUGGESTION_TEXTS[suggestion.key];
          return (
            <li key={suggestion.key} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 sm:px-5">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-[13px] font-medium text-ink"><Zap className="size-3.5 text-accent" aria-hidden="true" />{text.title}</p>
                <p className="mt-0.5 text-xs leading-5 text-muted">{text.body(suggestion.confirmed)}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button type="button" disabled={state.busy === suggestion.key} onClick={() => void state.decide(suggestion.key, "enable", text.enabled)}
                  className="rounded-md bg-ink px-3 py-1.5 text-xs font-medium text-white transition hover:bg-ink-soft disabled:opacity-50">Activar</button>
                <button type="button" disabled={state.busy === suggestion.key} onClick={() => void state.decide(suggestion.key, "dismiss")}
                  className="rounded-md border border-line px-3 py-1.5 text-xs font-medium text-ink-soft transition hover:bg-subtle disabled:opacity-50">Ahora no</button>
              </div>
            </li>
          );
        })}
      </ul>
      {state.error && <p role="alert" className="border-t border-line px-4 py-2 text-xs text-rose-700 sm:px-5">{state.error}</p>}
    </Panel>
  );
}
