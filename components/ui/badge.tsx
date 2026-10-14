import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Variant = "success" | "warning" | "danger" | "neutral" | "info";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: Variant;
}

const variantClasses: Record<Variant, string> = {
  success: "bg-emerald-50 text-emerald-800 border border-emerald-200/70",
  warning: "bg-amber-50 text-amber-800 border border-amber-200/70",
  danger: "bg-rose-50 text-rose-800 border border-rose-200/70",
  neutral: "bg-subtle text-ink-soft border border-line",
  info: "bg-sky-50 text-sky-800 border border-sky-200/70",
};

export function Badge({
  className,
  variant = "neutral",
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md text-[11px] font-medium px-1.5 py-0.5 whitespace-nowrap",
        variantClasses[variant],
        className
      )}
      {...props}
    />
  );
}
