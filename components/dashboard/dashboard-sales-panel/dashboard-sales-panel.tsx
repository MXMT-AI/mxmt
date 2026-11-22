import { Link } from "@/i18n/navigation";
import { Heading } from "@/components/ui/heading/heading";
import { panel } from "@/components/ui/panel/panel-styles";
import SalesSparkline from "../sales-sparkline/sales-sparkline";
import { dashboardDashboardSalesPanelMessages as englishCopy } from "@/messages/en.json";
import { dashboardDashboardSalesPanelMessages as ukrainianCopy } from "@/messages/uk.json";

export function DashboardSalesPanel({ data, total, weekChange, uk }: {
  data: { date: string; qty: number }[];
  total: number;
  weekChange: number | null;
  uk: boolean;
}) {
  return (
    <section className={panel + " mb-6 p-5"}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <Heading as="h2" variant="eyebrow" className="mb-1">{uk ? ukrainianCopy.sales30Days : englishCopy.sales30Days}</Heading>
          <div className="flex flex-wrap items-baseline gap-3">
            <span className="font-mono text-xl font-bold text-(--text)">{total}</span>
            <span className="text-[11px] text-(--muted)">{uk ? ukrainianCopy.units : englishCopy.units}</span>
            {weekChange !== null && (
              <span className={`font-mono text-xs font-semibold ${weekChange >= 0 ? "text-accent-positive" : "text-accent-negative"}`}>
                {weekChange >= 0 ? "+" : ""}{weekChange}% {uk ? ukrainianCopy.vsLastWeek : englishCopy.vsLastWeek}
              </span>
            )}
          </div>
        </div>
        <Link href="/analyst" className="font-mono text-[11px] text-(--muted) transition-colors hover:text-(--text)">
          {uk ? ukrainianCopy.details : englishCopy.details}
        </Link>
      </div>
      <SalesSparkline
        data={data}
        label={uk ? ukrainianCopy.labelSalesTrendOver30Days : englishCopy.labelSalesTrendOver30Days}
        emptyMessage={uk ? ukrainianCopy.emptyMessageInsufficientData : englishCopy.emptyMessageInsufficientData}
      />
    </section>
  );
}
