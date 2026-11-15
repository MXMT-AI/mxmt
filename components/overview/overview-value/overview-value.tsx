import type { ReactNode } from "react";

export function OverviewValue({ children }: { children: ReactNode }) {
  return (
    <p className="text-2xl md:text-3xl font-bold tracking-tight tabular-nums wrap-break-word">
      {children}
    </p>
  );
}
