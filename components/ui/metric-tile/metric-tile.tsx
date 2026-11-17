import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { panel } from "../panel/panel-styles";

const panelTile = panel + " p-5";

const styles = {
  centered: {
    tile: panel + " flex flex-col p-3 text-center",
    label: "order-2 mt-0.5 text-[10px] text-(--muted)",
    value: "order-1 font-mono text-lg font-bold",
  },
  planner: {
    tile: panelTile,
    label: "mb-2 font-mono text-[9px] tracking-widest text-(--subtle) uppercase",
    value: "font-mono text-2xl font-bold",
  },
  compact: {
    tile: "rounded-lg bg-(--row) px-3 py-2",
    label: "font-mono text-[9px] text-(--subtle) uppercase",
    value: "mt-0.5 font-mono text-[11px]",
  },
  summary: {
    tile: "rounded-xl border border-(--border) bg-(--surface2) px-3 py-2.5",
    label: "font-mono text-[9px] text-(--subtle) uppercase",
    value: "mt-0.5 font-mono text-[13px]",
  },
  dashboard: {
    tile: panelTile,
    label: "mb-3 font-mono text-[9px] tracking-widest text-(--subtle) uppercase",
    value: "mt-0.5 mb-1 font-mono text-2xl font-bold",
  },
  scenario: {
    tile: "",
    label: "text-xs text-(--muted)",
    value: "mt-1 text-lg tabular-nums text-inherit",
  },
  report: {
    tile: "",
    label: "text-sm text-(--muted)",
    value: "mt-1 text-sm tabular-nums",
  },
};

export function MetricTile({ label, value, color, description, valueClassName, variant = "compact" }: {
  valueClassName?: string;
  label: string;
  value: ReactNode;
  color?: CSSProperties["color"];
  description?: ReactNode;
  variant?: keyof typeof styles;
}) {
  return (
    <div className={styles[variant].tile}>
      <dt className={styles[variant].label}>{label}</dt>
      <dd className={cn("font-semibold text-(--text)", styles[variant].value, valueClassName)} style={{ color }}>
        {value}
        {description != null && <span className={`block font-sans font-normal text-(--muted) ${variant === "planner" ? "mt-1 text-xs" : "text-[11px]"}`}>{description}</span>}
      </dd>
    </div>
  );
}
