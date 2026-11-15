import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

const tones = {
  neutral: { fill: "bg-(--input-bg) text-(--muted)", border: "border-(--border)" },
  subtle: { fill: "bg-(--input-bg) text-(--subtle)", border: "border-(--border)" },
  positive: { fill: "bg-accent-cyan/10 text-accent-cyan", border: "border-accent-cyan/20" },
  warning: { fill: "bg-accent-yellow/10 text-accent-yellow", border: "border-accent-yellow/20" },
  danger: { fill: "bg-accent-danger/10 text-accent-danger", border: "border-accent-danger/20" },
  accent: { fill: "bg-accent-purple/10 text-accent-purple", border: "border-accent-purple/20" },
  report: { fill: "bg-accent-report/10 text-accent-report", border: "border-accent-report/20" },
};

export type BadgeTone = keyof typeof tones;

type BadgeProps = ComponentProps<"span"> & {
  tone?: BadgeTone;
  size?: "small" | "compact";
  outlined?: boolean;
};

export function Badge({ tone = "neutral", size = "compact", outlined = true, className, ...props }: BadgeProps) {
  const colors = tones[tone];
  return (
    <span
      className={cn(
        "rounded-sm py-0.5 font-mono",
        size === "small" ? "px-1.5 text-[9px]" : "px-2 text-[10px]",
        colors.fill,
        outlined && ["border", colors.border],
        className,
      )}
      {...props}
    />
  );
}
