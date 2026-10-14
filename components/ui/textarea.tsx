import type { TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export function Textarea({ className, ...props }: TextareaProps) {
  return (
    <textarea
      className={cn(
        "w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink resize-y",
        "placeholder:text-muted/70",
        "focus:outline-none focus:ring-2 focus:ring-ink/10 focus:border-line-strong",
        "transition-colors disabled:opacity-50 disabled:bg-subtle",
        className
      )}
      {...props}
    />
  );
}
