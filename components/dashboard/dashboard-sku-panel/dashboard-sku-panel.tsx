import { Link } from "@/i18n/navigation";
import { ActionLink } from "@/components/ui/action-link/action-link";
import { Heading } from "@/components/ui/heading/heading";
import { panel } from "@/components/ui/panel/panel-styles";
import type { ClassifiedSku } from "@/lib/analyst-types";
import type { Translations } from "@/lib/translations";
import { cn } from "@/lib/utils";
import { dashboardDashboardSkuPanelMessages as englishCopy } from "@/messages/en.json";
import { dashboardDashboardSkuPanelMessages as ukrainianCopy } from "@/messages/uk.json";

const styles = {
  stockout: {
    border: "border-accent-orange/20",
    ink: "text-accent-orange",
    action: "border-accent-orange/20 bg-accent-orange/10 text-accent-orange hover:border-accent-orange/20 hover:bg-accent-orange/20 hover:text-accent-orange",
  },
  hit: {
    border: "border-accent-cyan/20",
    ink: "text-accent-cyan",
    action: "border-accent-cyan/20 bg-accent-cyan/10 text-accent-cyan hover:border-accent-cyan/20 hover:bg-accent-cyan/20 hover:text-accent-cyan",
  },
};

export function DashboardSkuPanel({ items, total, kind, t, uk }: {
  items: ClassifiedSku[];
  total: number;
  kind: keyof typeof styles;
  t: Translations;
  uk: boolean;
}) {
  const stockout = kind === "stockout";
  const style = styles[kind];
  return (
    <section className={cn(panel, "p-6", style.border)}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <div className={cn("mb-1 font-mono text-[9px] tracking-widest uppercase", style.ink)}>
            {stockout ? t.dash_critical_label : t.dash_opportunity_label}
          </div>
          <Heading as="h2" variant="compact" className="text-base">{stockout ? t.dash_top_stockouts : t.dash_top_hits}</Heading>
        </div>
        {total > items.length && (
          <Link href="/analyst" className={cn("font-mono text-xs transition-colors hover:underline", style.ink)}>
            {stockout ? t.dash_all_stockouts : t.dash_all_hits}
          </Link>
        )}
      </div>

      <div className="space-y-2">
        {items.map((sku) => (
          <div key={sku.id} className="flex flex-wrap items-center justify-between gap-y-2 rounded-lg bg-(--row) px-4 py-2.5">
            <div className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-(--text)">{sku.name}</span>
              <span className="font-mono text-[11px] text-(--subtle)">{sku.sku}{sku.brand ? ` · ${sku.brand}` : ""}</span>
            </div>
            <div className="ml-4 flex shrink-0 items-center gap-3">
              <div className="text-right">
                <div className={cn("font-mono text-sm font-bold", style.ink)}>{stockout ? sku.daysOfStock : sku.sold7}</div>
                <div className="text-[10px] text-(--subtle)">{stockout ? t.dash_days_left : t.dash_sold_7d}</div>
              </div>
              <div className="text-right">
                <div className="font-mono text-sm text-(--muted)">{stockout ? sku.sold7 : sku.avgDaily30}</div>
                <div className="text-[10px] text-(--subtle)">{stockout ? t.dash_sold_7d : t.dash_avg_daily}</div>
              </div>
              <ActionLink
                href={stockout ? "/assortment" : "/calendar"}
                variant="secondary"
                className={cn("min-h-0 rounded-lg px-2.5 py-1 text-[11px] font-normal whitespace-nowrap", style.action)}
              >
                {stockout ? (uk ? ukrainianCopy.order : englishCopy.order) : (uk ? ukrainianCopy.calendar : englishCopy.calendar)}
              </ActionLink>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 border-t border-(--border-faint) pt-3">
        <Link href="/analyst" className={cn("text-[11px] transition-colors hover:underline", style.ink)}>{t.dash_view_analyst}</Link>
      </div>
    </section>
  );
}
