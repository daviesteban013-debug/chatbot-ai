import { cn } from "@/lib/utils";

/** NEXO's own mark: a solid square with a joined "N" and the brand yellow node. */
export function NexoMark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-8", className)} role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      <rect width="32" height="32" rx="7" fill="#18181b" />
      <path d="M9.5 22.5V9.5l13 13V9.5" fill="none" stroke="#fafafa" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="22.5" cy="9.5" r="2.6" fill="#facc15" />
    </svg>
  );
}
