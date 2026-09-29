import type { TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export function Textarea({ className, ...props }: TextareaProps) {
  return (
    <textarea
      className={cn(
        "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 resize-y",
        "placeholder:text-slate-400",
        "focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400",
        "transition-colors disabled:opacity-50 disabled:bg-slate-50",
        className
      )}
      {...props}
    />
  );
}
