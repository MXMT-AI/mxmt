"use client";

import { cn } from "@/lib/utils";
import { useRef, type ReactNode } from "react";

export function DisclosureMenu({
  label,
  className,
  summaryClassName,
  panelClassName,
  closeOnSelect = false,
  children,
}: {
  label: ReactNode;
  className: string;
  summaryClassName: string;
  panelClassName: string;
  closeOnSelect?: boolean;
  children: ReactNode;
}) {
  const menu = useRef<HTMLDetailsElement>(null);
  const summary = useRef<HTMLElement>(null);
  function closeMenu(restoreFocus: boolean) {
    if (!menu.current?.open) return;
    menu.current.open = false;
    if (restoreFocus) summary.current?.focus();
  }

  return (
    <details
      ref={menu}
      className={className}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) closeMenu(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && event.currentTarget.open) {
          event.preventDefault();
          event.stopPropagation();
          closeMenu(true);
        }
      }}
    >
      <summary ref={summary} className={cn("cursor-pointer list-none [&::-webkit-details-marker]:hidden", summaryClassName)}>{label}</summary>
      <div className={cn("absolute border border-[color:var(--ui-menu-border,var(--border))] bg-[color:var(--ui-menu-bg,var(--surface))]", panelClassName)} onClick={(event) => {
        if (event.target instanceof Element && event.target.closest(closeOnSelect ? "a, button" : "a")) {
          closeMenu(true);
        }
      }}>
        {children}
      </div>
    </details>
  );
}
