import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Variant = "success" | "warning" | "danger" | "neutral" | "info";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: Variant;
}

const variantClasses: Record<Variant, string> = {
  success: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  warning: "bg-amber-50 text-amber-700 border border-amber-200",
  danger: "bg-rose-50 text-rose-700 border border-rose-200",
  neutral: "bg-slate-100 text-slate-700 border border-slate-200",
  info: "bg-blue-50 text-blue-700 border border-blue-200",
};

export function Badge({
  className,
  variant = "neutral",
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full text-xs font-medium px-2 py-0.5 whitespace-nowrap",
        variantClasses[variant],
        className
      )}
      {...props}
    />
  );
}
