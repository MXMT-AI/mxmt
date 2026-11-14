"use client";

import { cn } from "@/lib/utils";
import { useRef, type ReactNode } from "react";

export function DisclosureMenu({
  label,
  className,
  summaryClassName,
  panelClassName,
  children,
}: {
  label: ReactNode;
  className: string;
  summaryClassName: string;
  panelClassName: string;
  children: ReactNode;
}) {
  const menu = useRef<HTMLDetailsElement>(null);
  const summary = useRef<HTMLElement>(null);

  return (
    <details
      ref={menu}
      className={className}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false;
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && event.currentTarget.open) {
          event.currentTarget.open = false;
          summary.current?.focus();
        }
      }}
    >
      <summary ref={summary} className={cn("cursor-pointer list-none [&::-webkit-details-marker]:hidden", summaryClassName)}>{label}</summary>
      <div className={cn("absolute border border-[color:var(--ui-menu-border,var(--border))] bg-[color:var(--ui-menu-bg,var(--surface))]", panelClassName)} onClick={(event) => {
        if (event.target instanceof Element && event.target.closest("a") && menu.current) {
          summary.current?.focus();
          menu.current.open = false;
        }
      }}>
        {children}
      </div>
    </details>
  );
}
