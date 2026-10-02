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
      onClick={handleTake}
      disabled={isPending}
      className="bg-blue-600 text-white hover:bg-blue-700 focus-visible:ring-blue-600"
    >
      <UserPlus className="size-4" />
      {isPending ? "Tomando…" : "Tomar"}
    </Button>
  );
}
