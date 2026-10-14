"use client";

import { useTransition } from "react";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { takeHandoff } from "./actions";

/**
 * Botón "Tomar" de la lista de handoffs. Componente cliente porque dispara una
 * Server Action con estado de carga y transición.
 */
export function TakeHandoffButton({ handoffId }: { handoffId: string }) {
  const [isPending, startTransition] = useTransition();

  function handleTake() {
    startTransition(async () => {
      await takeHandoff(handoffId);
    });
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="secondary"
      onClick={handleTake}
      disabled={isPending}
      className="h-7 gap-1.5 px-2.5 text-xs"
    >
      <UserPlus className="size-3.5" />
      {isPending ? "Tomando…" : "Tomar"}
    </Button>
  );
}
