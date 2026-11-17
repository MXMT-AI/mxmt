import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { panel } from "../panel/panel-styles";

export function AlertPanel({ message, children, className }: {
  message: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div role="alert" className={cn(panel, "rounded-lg p-5 space-y-3", className)}>
      <p>{message}</p>
      {children}
    </div>
  );
}
