import { Link } from "@/i18n/navigation";
import { Heading } from "@/components/ui/heading/heading";
import SalesSparkline from "../sales-sparkline/sales-sparkline";

export function DashboardSalesPanel({ data, total, weekChange, uk }: {
  data: { date: string; qty: number }[];
  total: number;
  weekChange: number | null;
  uk: boolean;
}) {
  return (
    <section className="mb-6 rounded-xl border border-(--border) bg-(--surface) p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <Heading as="h2" variant="eyebrow" className="mb-1">{uk ? "Продажі — 30 днів" : "Sales — 30 days"}</Heading>
          <div className="flex flex-wrap items-baseline gap-3">
            <span className="font-mono text-xl font-bold text-(--text)">{total}</span>
            <span className="text-[11px] text-(--muted)">{uk ? "одиниць" : "units"}</span>
            {weekChange !== null && (
              <span className={`font-mono text-xs font-semibold ${weekChange >= 0 ? "text-accent-positive" : "text-accent-negative"}`}>
                {weekChange >= 0 ? "+" : ""}{weekChange}% {uk ? "vs минулий тиждень" : "vs last week"}
              </span>
            )}
          </div>
        </div>
        <Link href="/analyst" className="font-mono text-[11px] text-(--muted) transition-colors hover:text-(--text)">
          {uk ? "Детально →" : "Details →"}
        </Link>
      </div>
      <SalesSparkline
        data={data}
        label={uk ? "Динаміка продажів за 30 днів" : "Sales trend over 30 days"}
        emptyMessage={uk ? "Недостатньо даних" : "Insufficient data"}
      />
    </section>
  );
}
