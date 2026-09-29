import type { SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

export function Select({ className, children, ...props }: SelectProps) {
  return (
    <div className="relative w-full">
      <select
        className={cn(
          "w-full appearance-none rounded-lg border border-slate-200 bg-white pl-3 pr-9 py-2 text-sm text-slate-900",
          "focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400",
          "transition-colors disabled:opacity-50 disabled:bg-slate-50",
          className
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400"
        aria-hidden="true"
      />
    </div>
  );
}
