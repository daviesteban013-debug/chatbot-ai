"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface TabItem {
  id: string;
  label: string;
  content: ReactNode;
}

export interface TabsProps {
  items: TabItem[];
  defaultActiveId?: string;
  className?: string;
}

export function Tabs({ items, defaultActiveId, className }: TabsProps) {
  const [activeId, setActiveId] = useState<string>(
    defaultActiveId ?? items[0]?.id ?? ""
  );

  const activeItem = items.find((item) => item.id === activeId) ?? items[0];

  return (
    <div className={cn("w-full", className)}>
      <div
        role="tablist"
        aria-orientation="horizontal"
        className="flex items-center gap-1 border-b border-slate-200"
      >
        {items.map((item) => {
          const isActive = item.id === activeItem?.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveId(item.id)}
              className={cn(
                "relative -mb-px px-3 py-2 text-sm font-medium transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/10 rounded-t-lg",
                isActive
                  ? "text-slate-900"
                  : "text-slate-500 hover:text-slate-700"
              )}
            >
              {item.label}
              <span
                className={cn(
                  "absolute left-0 right-0 -bottom-px h-0.5 rounded-full transition-opacity",
                  isActive ? "bg-slate-900 opacity-100" : "opacity-0"
                )}
              />
            </button>
          );
        })}
      </div>
      <div role="tabpanel" className="pt-4">
        {activeItem?.content}
      </div>
    </div>
  );
}
