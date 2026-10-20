"use client";
import { useNexoActivity } from "@/hooks/useNexoActivity";
import { NexoActivity } from "./nexo-activity";

/** Client wrapper so the dashboard home (a server page) can show live Zorax activity. */
export function HomeActivity({ enabled, canConfigure }: { enabled: boolean; canConfigure: boolean }) {
  const state = useNexoActivity(enabled, { limit: 8 });
  if (!enabled) return null;
  return <NexoActivity state={state} canConfigure={canConfigure} />;
}
