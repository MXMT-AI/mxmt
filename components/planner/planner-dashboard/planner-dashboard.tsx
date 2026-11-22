import { MetricTile } from "@/components/ui/metric-tile/metric-tile";
import type { Brand, CatalogUpload, BrandBudgetStatus } from "../planner-types";
import { formatMessage } from "@/i18n/format-message";
import { plannerPlannerDashboardMessages as englishCopy } from "@/messages/en.json";
import { plannerPlannerDashboardMessages as ukrainianCopy } from "@/messages/uk.json";

export function PlannerDashboard({ brands, catalogs, budgetStatus, cartLineCount, totalBudget, totalSpent, totalCartItems, fmt }: {
  brands: Brand[];
  catalogs: CatalogUpload[];
  budgetStatus: BrandBudgetStatus[];
  cartLineCount: number;
  totalBudget: number;
  totalSpent: number;
  totalCartItems: number;
  fmt: (n: number) => string;
}) {
  const totalItems = catalogs.reduce((sum, catalog) => sum + catalog.itemCount, 0);

  const stats = [
    { label: ukrainianCopy.labelБрендів, value: brands.length, sub: formatMessage(ukrainianCopy.subКаталогів, { length: catalogs.length }) },
    { label: ukrainianCopy.labelТоварівУКаталозі, value: totalItems, sub: ukrainianCopy.subПоВсіхБрендах },
    { label: ukrainianCopy.labelУЗамовленні, value: cartLineCount, sub: formatMessage(ukrainianCopy.subОдиниць, { totalCartItems }) },
    {
      label: ukrainianCopy.labelБюджетВикористано,
      value: `${Math.round((totalSpent / Math.max(totalBudget, 1)) * 100)}%`,
      sub: formatMessage(ukrainianCopy.subЗ, { value1: fmt(totalSpent), value2: fmt(totalBudget) }),
    },
  ];

  return (
    <div className="max-w-4xl">
      <dl className="grid grid-cols-4 gap-4 mb-8">
        {stats.map(({ label, value, sub }) => (
          <MetricTile key={label} variant="planner" label={label} value={value} description={sub} />
        ))}
      </dl>

      <div className="bg-(--surface) border border-(--border) rounded-xl p-5 mb-4">
        <div className="text-[9px] font-mono uppercase tracking-widest text-(--subtle) mb-4">{ukrainianCopy.бюджетПоБрендах}</div>
        {budgetStatus.length === 0 && (
          <p className="text-(--muted) text-sm">{ukrainianCopy.брендівЩеНемаєДодайтеБренди}</p>
        )}
        {budgetStatus.map((b) => (
          <div key={b.id} className="flex items-center gap-4 py-2 border-b border-(--border-faint) last:border-0">
            <div className="w-32 text-sm text-white font-medium truncate">{b.name}</div>
            <div className="flex-1 h-1.5 bg-white/[0.07] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.min(b.pct, 100)}%`,
                  background: b.pct > 100 ? "#ff6b35" : b.pct > 80 ? "#fbbf24" : "#00e5c4",
                }}
              />
            </div>
            <div className="text-xs font-mono text-(--muted) w-24 text-right">
              €{fmt(b.spent)} / €{fmt(b.budget)}
            </div>
            <div className={`text-xs font-mono w-10 text-right ${b.pct > 100 ? "text-accent-orange" : "text-(--muted)"}`}>
              {b.pct}%
            </div>
          </div>
        ))}
      </div>

      {catalogs.length > 0 && (
        <div className="bg-(--surface) border border-(--border) rounded-xl p-5">
          <div className="text-[9px] font-mono uppercase tracking-widest text-(--subtle) mb-4">{ukrainianCopy.останніЗавантаження}</div>
          <div className="space-y-2">
            {catalogs.slice(0, 5).map((c) => (
              <div key={c.id} className="flex items-center justify-between py-1.5">
                <div>
                  <span className="text-sm text-white font-medium">{c.brand.name}</span>
                  <span className="text-(--subtle) mx-2">·</span>
                  <span className="text-xs font-mono text-accent-cyan">{c.season}</span>
                </div>
                <span className="text-xs text-(--muted)">{c.itemCount}{englishCopy.items}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
