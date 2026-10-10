"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarClock } from "lucide-react";

/** Poll only the count; task content is fetched inside the authenticated CRM. */
export function TaskAlerts({ onOpen }: { onOpen?: () => void }) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let live = true;
    async function refresh() {
      if (document.visibilityState !== "visible") return;
      try {
        const response = await fetch("/api/workspace/alerts", { cache: "no-store" });
        if (!response.ok) { if (live) setCount(0); return; }
        const data = await response.json();
        if (live) setCount(Number.isSafeInteger(data.overdue) ? Math.max(0, data.overdue) : 0);
      } catch { /* Do not invent a reminder when the CRM cannot be checked. */ }
    }
    void refresh(); const timer = window.setInterval(() => void refresh(), 60000);
    document.addEventListener("visibilitychange", refresh);
    return () => { live = false; window.clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
  }, []);
  if (!count) return null;
  const content = <><CalendarClock size={15}/><span>{count} {count === 1 ? "tarea vencida" : "tareas vencidas"}</span></>;
  const style = "inline-flex items-center gap-2 rounded-xl border border-amber-300/40 bg-amber-100 px-3 py-2 text-xs font-semibold text-amber-900";
  return onOpen ? <button type="button" className={style} onClick={onOpen}>{content}</button> : <Link href="/dashboard/workspace" className={style}>{content}</Link>;
}
