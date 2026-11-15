import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Note({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("text-xs leading-relaxed text-(--muted)", className)}>{children}</p>
  );
}
