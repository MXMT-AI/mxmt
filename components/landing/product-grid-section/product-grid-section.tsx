"use client";

import { useRef, type PointerEvent, type ReactNode } from "react";
import { Section } from "@/components/ui/section/section";
import styles from "./product-grid.module.css";

export function ProductGridSection({ children }: { children: ReactNode }) {
  const highlight = useRef<HTMLDivElement>(null);

  function moveHighlight(event: PointerEvent<HTMLElement>) {
    if (event.pointerType !== "mouse" || !highlight.current) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const { style } = highlight.current;
    style.setProperty("--grid-x", `${event.clientX - bounds.left}px`);
    style.setProperty("--grid-y", `${event.clientY - bounds.top}px`);
    highlight.current.setAttribute("data-active", "");
  }

  function hideHighlight() {
    highlight.current?.removeAttribute("data-active");
  }

  return (
    <Section
      id="product"
      aria-labelledby="product-heading"
      className="relative"
      contentClassName="relative"
      background={<div ref={highlight} className={`pointer-events-none absolute inset-0 ${styles.productGrid}`} aria-hidden="true" />}
      onPointerMove={moveHighlight}
      onPointerLeave={hideHighlight}
      onPointerCancel={hideHighlight}
    >
      {children}
    </Section>
  );
}
