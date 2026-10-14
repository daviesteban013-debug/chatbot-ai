import type { HTMLAttributes, ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

/** The panel's one surface: white, 1px line, small radius, no shadow. */
export function Panel({ className, as: Tag = "section", ...props }: HTMLAttributes<HTMLElement> & { as?: "section" | "article" | "div" | "aside" }) {
  return <Tag className={cn("rounded-lg border border-line bg-surface", className)} {...props} />;
}

export function PanelHeader({ title, description, actions, id, className }: {
  title: ReactNode; description?: ReactNode; actions?: ReactNode; id?: string; className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-line px-4 py-3 sm:px-5", className)}>
      <div className="min-w-0">
        <h2 id={id} className="text-[13px] font-semibold text-ink">{title}</h2>
        {description ? <p className="mt-0.5 text-xs text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function PanelLink({ href, children }: { href: string; children: ReactNode }) {
  return <Link href={href} className="text-xs font-medium text-muted transition hover:text-ink">{children}</Link>;
}

/** A figure with its label; no decorative icon. */
export function Stat({ label, value, detail, delta, href, className }: {
  label: string; value: ReactNode; detail?: ReactNode; delta?: ReactNode; href?: string; className?: string;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted">{label}</span>
        {delta}
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-ink tabular-nums">{value}</p>
      {detail ? <p className="mt-1 text-xs text-muted">{detail}</p> : null}
    </>
  );
  const base = cn("block bg-surface p-4 sm:p-5", className);
  return href ? <Link href={href} className={cn(base, "transition hover:bg-subtle")}>{body}</Link> : <div className={base}>{body}</div>;
}

/** Stats separated by hairlines inside a single panel. */
export function StatGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("grid gap-px overflow-hidden rounded-lg border border-line bg-line", className)}>{children}</div>;
}

export type SegmentedOption = { value: string; label: ReactNode; href?: string; count?: number };

/** One style for every filter or period switch in the panel. */
export function Segmented({ options, value, onChange, label, className }: {
  options: SegmentedOption[]; value: string; onChange?(value: string): void; label: string; className?: string;
}) {
  return (
    <nav aria-label={label} className={cn("inline-flex max-w-full overflow-x-auto rounded-md border border-line bg-surface p-0.5", className)}>
      {options.map(option => {
        const active = option.value === value;
        const style = cn("inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[5px] px-2.5 py-1 text-xs font-medium transition",
          active ? "bg-ink text-white" : "text-muted hover:bg-subtle hover:text-ink");
        const content = <>{option.label}{typeof option.count === "number" ? <span className={cn("tabular-nums", active ? "text-white/70" : "text-muted")}>{option.count}</span> : null}</>;
        return option.href
          ? <Link key={option.value} href={option.href} scroll={false} aria-current={active ? "page" : undefined} className={style}>{content}</Link>
          : <button key={option.value} type="button" aria-pressed={active} onClick={() => onChange?.(option.value)} className={style}>{content}</button>;
      })}
    </nav>
  );
}

/** Small colored dot + text, for statuses inside dense lists. */
export function StatusDot({ tone = "neutral", children }: { tone?: "good" | "warn" | "bad" | "neutral" | "info"; children: ReactNode }) {
  const color = { good: "bg-emerald-500", warn: "bg-amber-500", bad: "bg-rose-500", neutral: "bg-zinc-400", info: "bg-sky-500" }[tone];
  return <span className="inline-flex items-center gap-1.5 text-xs text-ink-soft"><span className={cn("size-1.5 shrink-0 rounded-full", color)} aria-hidden="true" />{children}</span>;
}
