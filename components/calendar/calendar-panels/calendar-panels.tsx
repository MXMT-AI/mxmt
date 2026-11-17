import { Fragment, type ReactNode } from "react";
import { Badge, type BadgeTone } from "@/components/ui/badge/badge";
import { Button } from "@/components/ui/button/button";
import { Heading } from "@/components/ui/heading/heading";
import { panel } from "@/components/ui/panel/panel-styles";
import type { Locale } from "@/i18n/routing";
import { cn } from "@/lib/utils";
import type { InsightItem, StockItem } from "../marketing-calendar/calendar-types";

const rowLimit = 10;
const insightStyles = {
  warn: { card: "border-accent-danger bg-accent-negative/8", icon: "!", ink: "bg-accent-danger/15 text-accent-negative" },
  agent: { card: "border-accent-positive bg-accent-positive/8", icon: "+", ink: "bg-accent-positive/15 text-accent-positive" },
  stock: { card: "border-accent-info bg-accent-info/8", icon: "↑", ink: "bg-accent-info/15 text-accent-info" },
};

const stockStyles = {
  ok: { uk: "Норма", en: "Normal", color: "bg-accent-positive", tone: "positive" },
  warn: { uk: "Мало", en: "Low", color: "bg-accent-yellow", tone: "warning" },
  crit: { uk: "Крит.", en: "Critical", color: "bg-accent-negative", tone: "danger" },
  excess: { uk: "Надлишок", en: "Excess", color: "bg-accent-info", tone: "report" },
} satisfies Record<StockItem["status"], { uk: string; en: string; color: string; tone: BadgeTone }>;

type PanelProps = {
  title: string;
  locale: Locale;
  expanded: boolean;
  onToggle: () => void;
};

function CalendarPanel<Item>({ title, locale, expanded, onToggle, items, renderItem }: PanelProps & {
  items: Item[];
  renderItem: (item: Item) => ReactNode;
}) {
  const uk = locale === "uk";
  const visible = expanded ? items : items.slice(0, rowLimit);
  const hiddenCount = items.length - rowLimit;

  return (
    <section className={cn(panel, "p-5")}>
      <div className="mb-4 flex items-center justify-between">
        <Heading as="h3" variant="compact" className="font-bold">{title}</Heading>
        {hiddenCount > 0 && <span className="font-mono text-[10px] text-(--subtle)">{visible.length}/{items.length}</span>}
      </div>
      <div className="[&>div:last-child]:mb-0 [&>div:last-child]:border-b-0">
        {visible.map((item, index) => <Fragment key={index}>{renderItem(item)}</Fragment>)}
      </div>
      {hiddenCount > 0 && (
        <Button
          onClick={onToggle}
          aria-expanded={expanded}
          className="mt-3 w-full justify-center rounded-none border-0 border-t border-(--border-faint) py-2 font-sans text-xs hover:bg-transparent"
        >
          {expanded
            ? (uk ? "Сховати ▲" : "Show less ▲")
            : (uk ? `Показати ще ${hiddenCount} ▼` : `Show ${hiddenCount} more ▼`)}
        </Button>
      )}
    </section>
  );
}

export function CalendarInsightsPanel({ items, ...props }: PanelProps & { items: InsightItem[] }) {
  return (
    <CalendarPanel {...props} items={items} renderItem={(insight) => {
      const style = insightStyles[insight.type] ?? insightStyles.agent;
      return (
        <div className={cn("mb-2 flex gap-3 rounded-lg border-s-[3px] p-3", style.card)}>
          <div className={cn("flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold", style.ink)} aria-hidden="true">{style.icon}</div>
          <div className="min-w-0 flex-1">
            <div className="mb-0.5 flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-(--text)">{insight.brand}</span>
              <span className="text-[10px] text-(--muted)">{insight.week}</span>
            </div>
            <div className="mb-0.5 text-[11px] font-medium text-(--text)">{insight.title}</div>
            <div className="mb-0.5 text-[10px] text-(--muted)">{insight.desc}</div>
            <div className="text-[10px] font-medium text-(--text)">{insight.impact}</div>
          </div>
        </div>
      );
    }} />
  );
}

export function CalendarStockPanel({ items, locale, ...props }: PanelProps & { items: StockItem[] }) {
  const uk = locale === "uk";
  return (
    <CalendarPanel {...props} locale={locale} items={items} renderItem={(stock) => {
      const style = stockStyles[stock.status];
      const barWidth = Math.min(100, Math.max(4, (stock.woh ?? 0) * 0.8));
      return (
        <div className="flex items-center justify-between gap-3 border-b border-(--border-faint) py-2.5">
          <div className="min-w-0 flex-1">
            <div className="text-xs font-bold text-(--text)">{stock.brand}</div>
            <div className="font-mono text-[10px] text-(--muted)">WOH {stock.woh ?? "—"}{uk ? "д" : "d"} · {stock.stock} {uk ? "шт" : "pcs"}</div>
            <div className="mt-1 h-1 rounded-full bg-(--input-bg)">
              <div className={cn("h-full rounded-full transition-all", style.color)} style={{ width: `${barWidth}%` }} />
            </div>
          </div>
          <Badge tone={style.tone} size="small" outlined={false} className={cn("shrink-0 rounded-full font-sans font-bold", stock.status === "excess" && "bg-accent-info/10 text-accent-info")}>
            {style[locale]}
          </Badge>
        </div>
      );
    }} />
  );
}
