import type { CSSProperties } from "react";
import styles from "./problem-illustration.module.css";

const heights = [15, 24, 21, 34, 28, 42, 48, 40, 60, 55, 75, 69, 86, 80, 96, 89];

export function ProblemIllustration({ code }: { code: "404" | "500" }) {
  return (
    <div className={`relative isolate grid min-h-[clamp(220px,35vw,455px)] min-w-0 items-center overflow-hidden border border-(--problem-line) ${styles.art}`} data-code={code} aria-hidden="true">
      <div className={`absolute inset-[9%_8%_12%] -skew-y-[9deg] border-b border-(--problem-line) ${styles.chart}`}>
        <div className={`grid h-full grid-cols-[repeat(16,minmax(0,1fr))] items-end gap-[clamp(3px,.8vw,11px)] px-[3%] ${styles.bars}`}>
          {heights.map((height, index) => (
            <i key={index} className="h-(--height) border border-(--problem-accent)" style={{ "--height": `${height}%` } as CSSProperties} />
          ))}
        </div>
      </div>
      <span className={`me-[.14em] justify-self-center font-mono text-[clamp(94px,16vw,250px)] leading-[.9] font-bold tracking-[-.14em] text-(--problem-ink) max-[750px]:text-[clamp(86px,23vw,156px)] ${styles.artCode}`}>{code}</span>
    </div>
  );
}
