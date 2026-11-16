import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Field({
  label,
  children,
  className,
  htmlFor,
}: {
  label: string;
  children: ReactNode;
  className?: string;
  htmlFor?: string;
}) {
  return (
    <label htmlFor={htmlFor} className={cn("flex min-w-0 flex-col gap-1.5 text-xs text-(--muted)", className)}>
      {label}
      {children}
    </label>
  );
}
