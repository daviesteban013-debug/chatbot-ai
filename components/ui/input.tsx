import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export function Input({ className, ...props }: InputProps) {
  return (
    <input
      className={cn(
        "w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink",
        "placeholder:text-muted/70",
        "focus:outline-none focus:ring-2 focus:ring-ink/10 focus:border-line-strong",
        "transition-colors disabled:opacity-50 disabled:bg-subtle",
        className
      )}
      {...props}
    />
  );
}
