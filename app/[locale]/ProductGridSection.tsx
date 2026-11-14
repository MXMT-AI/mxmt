"use client";

import { useRef, type PointerEvent, type ReactNode } from "react";
import styles from "./landing.module.css";

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
    <section
      id="product"
      aria-labelledby="product-heading"
      className={styles.productSection}
      onPointerMove={moveHighlight}
      onPointerLeave={hideHighlight}
      onPointerCancel={hideHighlight}
    >
      <div ref={highlight} className={styles.productGrid} aria-hidden="true" />
      <div className={`${styles.wrap} ${styles.section} ${styles.productContent}`}>{children}</div>
    </section>
  );
}
