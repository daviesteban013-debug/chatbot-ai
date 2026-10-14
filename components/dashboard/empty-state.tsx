import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

/** Estado vacío: qué falta y qué hacer, sin adornos. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-center justify-center rounded-lg border border-dashed border-line-strong bg-surface px-6 py-12 text-center ${className ?? ""}`}>
      <Icon className="mb-3 size-5 text-muted" strokeWidth={1.75} aria-hidden="true" />
      <p className="text-sm font-medium text-ink">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-sm leading-6 text-muted">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
