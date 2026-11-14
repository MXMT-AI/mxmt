"use client";

import { useRef, type ReactNode } from "react";

export function LandingMenu({
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
      <summary ref={summary} className={summaryClassName}>{label}</summary>
      <div className={panelClassName} onClick={(event) => {
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
