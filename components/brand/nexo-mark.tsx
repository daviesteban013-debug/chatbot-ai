import { cn } from "@/lib/utils";

/** Zorax's own mark: a solid square with a joined "Z" and the brand yellow node where the stroke ends. */
export function NexoMark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-8", className)} role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      <rect width="32" height="32" rx="7" fill="#18181b" />
      <path d="M9.5 9.5h13l-13 13h13" fill="none" stroke="#fafafa" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="22.5" cy="22.5" r="2.6" fill="#facc15" />
    </svg>
  );
}
