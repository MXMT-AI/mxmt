import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function AlertPanel({ message, children, className }: {
  message: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div role="alert" className={cn("rounded-lg border border-(--border) bg-(--surface) p-5 space-y-3", className)}>
      <p>{message}</p>
      {children}
    </div>
  );
}
