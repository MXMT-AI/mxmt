import type { ReactNode } from "react";
import { agentsAgentCardResultSummaryMessages as ukrainianCopy } from "@/messages/uk.json";

export function ResultSummary({
  expanded,
  onToggle,
  label = ukrainianCopy.labelДетально,
  children,
}: {
  expanded: boolean;
  onToggle: () => void;
  label?: string;
  children: ReactNode;
}) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {children}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="ml-auto text-[10px] font-mono text-(--muted) hover:text-(--text)"
      >
        {expanded ? ukrainianCopy.згорнути : label}
      </button>
    </div>
  );
}
