import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Note({ className, ...props }: ComponentProps<"p">) {
  return (
    <p className={cn("text-xs leading-relaxed text-(--muted)", className)} {...props} />
  );
}
