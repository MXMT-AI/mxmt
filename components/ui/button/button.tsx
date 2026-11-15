import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { button } from "./button-styles";

const variants = {
  report: cn(button, "text-inherit"),
  compact: "inline-flex items-center gap-1.5 px-2.5 py-1 font-mono text-[10px]",
  icon: "grid min-h-11 min-w-11 place-items-center bg-(--surface)",
  accent: "border-0 bg-accent-fill px-4 py-2.5 text-sm font-semibold text-accent-fill-ink hover:bg-accent-fill-hover hover:text-accent-fill-ink",
};

type ButtonProps = ComponentProps<"button"> & {
  variant?: keyof typeof variants;
};

export function Button({ variant = "compact", type = "button", className, ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "rounded-lg border border-(--border) text-(--muted) transition-colors hover:bg-(--input-bg) hover:text-(--text) disabled:cursor-not-allowed disabled:opacity-50",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
