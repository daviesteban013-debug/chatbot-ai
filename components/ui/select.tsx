import type { SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

export function Select({ className, children, ...props }: SelectProps) {
  return (
    <div className="relative w-full">
      <select
        className={cn(
          "w-full appearance-none rounded-md border border-line bg-surface pl-3 pr-9 py-2 text-sm text-ink",
          "focus:outline-none focus:ring-2 focus:ring-ink/10 focus:border-line-strong",
          "transition-colors disabled:opacity-50 disabled:bg-subtle",
          className
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted"
        aria-hidden="true"
      />
    </div>
  );
}
