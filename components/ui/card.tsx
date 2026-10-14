import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type DivProps = HTMLAttributes<HTMLDivElement>;

export function Card({ className, ...props }: DivProps) {
  return (
    <div
      className={cn(
        "bg-surface rounded-lg border border-line",
        className
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: DivProps) {
  return (
    <div
      className={cn("flex flex-col gap-1.5 p-5 sm:p-6", className)}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: DivProps) {
  return (
    <h3
      className={cn(
        "text-ink font-semibold text-[15px] leading-tight",
        className
      )}
      {...props}
    />
  );
}

export function CardDescription({ className, ...props }: DivProps) {
  return (
    <p className={cn("text-muted text-sm", className)} {...props} />
  );
}

export function CardContent({ className, ...props }: DivProps) {
  return (
    <div
      className={cn("p-5 sm:p-6 [&:not(:first-child)]:pt-0", className)}
      {...props}
    />
  );
}

export function CardFooter({ className, ...props }: DivProps) {
  return (
    <div
      className={cn(
        "flex items-center p-5 sm:p-6 pt-0 border-t border-line",
        className
      )}
      {...props}
    />
  );
}
