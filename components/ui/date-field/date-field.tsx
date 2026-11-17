import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { controlBase } from "../control-styles/control-styles";

type DateFieldProps = Omit<ComponentProps<"input">, "type"> & {
  id: string;
  label: string;
  variant?: "inline" | "stacked";
};

export function DateField({ id, label, variant = "inline", className, ...props }: DateFieldProps) {
  const stacked = variant === "stacked";
  return (
    <div className={stacked ? "grid gap-1" : "flex items-center gap-2"}>
      <label htmlFor={id} className={stacked ? "text-[11px] text-(--muted)" : "font-mono text-[10px] text-(--subtle)"}>{label}</label>
      <input
        {...props}
        id={id}
        type="date"
        className={cn(
          controlBase,
          "bg-(--input-bg)",
          stacked ? "h-9 text-sm" : "min-h-11 py-1.5 font-mono text-xs",
          className,
        )}
      />
    </div>
  );
}
