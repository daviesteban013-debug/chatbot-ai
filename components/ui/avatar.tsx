import { cn } from "@/lib/utils";

export interface AvatarProps {
  name: string;
  className?: string;
}

function getInitials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 0);

  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();

  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Avatar({ name, className }: AvatarProps) {
  return (
    <span
      title={name}
      aria-label={name}
      className={cn(
        "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
        "bg-slate-100 text-slate-700 text-sm font-semibold select-none",
        className
      )}
    >
      {getInitials(name)}
    </span>
  );
}
