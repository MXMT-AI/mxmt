import { Badge } from "@/components/ui/badge/badge";
import { cn } from "@/lib/utils";
import { badgeStyle } from "../agent-card-presentation";
import type { InsightRow, InsightVariant } from "./insight-rows";
import { agentsInsightListMessages as ukrainianCopy } from "@/messages/uk.json";

const layouts = {
  card: {
    list: "space-y-2 border-t border-(--border) px-4 py-3",
    row: "rounded-lg bg-(--row) px-4 py-3",
    header: "mb-1 justify-between",
    badge: { size: "compact", outlined: false, className: "rounded px-1.5" },
    insight: "text-[11px]",
    recommendation: "mt-1 text-[11px]",
  },
  dialog: {
    list: "space-y-3",
    row: "rounded-xl border border-(--border) p-4",
    header: "mb-2",
    badge: { size: "small", outlined: true, className: "ml-2 shrink-0" },
    insight: "mb-2 text-xs leading-relaxed",
    recommendation: "text-xs",
  },
} as const;

export function InsightList({
  rows,
  summary,
  action,
  capitalizeTitles = false,
  variant = "card",
}: {
  rows: InsightRow[];
  summary?: string;
  action?: string;
  capitalizeTitles?: boolean;
  variant?: InsightVariant;
}) {
  const layout = layouts[variant];

  return (
    <div className={layout.list}>
      {summary && <p className="pb-2 text-sm text-(--muted)">{summary}</p>}
      {rows.map((row, index) => (
        <div key={index} className={layout.row}>
          <div className={cn("flex items-center", layout.header)}>
            <span className={cn("text-sm font-semibold text-(--text)", capitalizeTitles && "capitalize")}>{row.title}</span>
            <Badge
              tone={row.tone}
              {...layout.badge}
              style={row.color ? badgeStyle(row.color) : undefined}
            >
              {row.status?.toUpperCase()}
            </Badge>
          </div>
          {row.insight && <p className={cn("text-(--muted)", layout.insight)}>{row.insight}</p>}
          {row.recommendation && <p className={cn("text-accent-cyan", layout.recommendation)}>→ {row.recommendation}</p>}
        </div>
      ))}
      {action && (
        <div className="mt-2 rounded-lg border border-accent-cyan/20 bg-accent-cyan/5 px-3 py-2">
          <span className="text-[10px] font-mono text-(--subtle)">{ukrainianCopy.дія}</span>
          <span className="text-[11px] text-accent-cyan">{action}</span>
        </div>
      )}
    </div>
  );
}
