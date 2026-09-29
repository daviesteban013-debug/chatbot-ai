"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ManageStripeButton() {
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  function handleClick() {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastVisible(true);
    toastTimerRef.current = setTimeout(() => setToastVisible(false), 2500);
  }

  return (
    <>
      <Button
        variant="secondary"
        onClick={handleClick}
        className="w-full sm:w-auto"
      >
        <ExternalLink className="h-4 w-4" aria-hidden="true" />
        Gestionar en Stripe
      </Button>

      {/* Toast simulado de redirección a Stripe */}
      {toastVisible && (
        <div
          role="status"
          className="fixed bottom-4 left-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 sm:bottom-6"
        >
          <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-lg">
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            </span>
            <p className="text-sm font-medium text-slate-900">
              Redirigiendo a Stripe...
            </p>
          </div>
        </div>
      )}
    </>
  );
}
