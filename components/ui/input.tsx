import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export function Input({ className, ...props }: InputProps) {
  return (
    <input
      className={cn(
        "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900",
        "placeholder:text-slate-400",
        "focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400",
        "transition-colors disabled:opacity-50 disabled:bg-slate-50",
        className
      )}
      {...props}
    />
  );
}
