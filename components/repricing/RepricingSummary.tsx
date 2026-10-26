import {
  panel,
  button,
  Note,
} from "@/components/merchandising/ReportPrimitives";
import { formatTableValue as format } from "@/lib/data-reporting-ui";
import type { RepricingCopy } from "@/lib/repricing-copy";
import type { RepricingPreview } from "./useRepricingPreview";
/** Only show authoritative current totals, with no local financial calculations. */
export default function RepricingSummary({
  data,
  current,
  copy,
  locale,
  onExport,
  exporting = false,
}: {
  data: RepricingPreview | null;
  current: boolean;
  copy: RepricingCopy;
  locale: string;
  onExport?: () => void;
  exporting?: boolean;
}) {
  const totals = current ? data?.totals : null;
  const values = [
    [copy.capital, totals?.costCapital, "money"],
    [copy.revenue, totals?.potentialRevenue, "money"],
    [copy.weighted, totals?.weightedDiscount, "percentage"],
    [copy.profit, totals?.grossProfit, "money"],
    [copy.grossMargin, totals?.grossMargin, "percentage"],
    [copy.selectedSkus, totals?.skuCount, "number"],
    [copy.duration, totals?.durationDays, "number"],
  ] as const;
  return (
    <section
      className={panel + " p-5 space-y-4"}
      aria-labelledby="repricing-summary"
      aria-busy={!current}
    >
      <div className="flex flex-wrap justify-between items-center gap-3">
        <h2 id="repricing-summary" className="font-semibold">
          {copy.summary}
        </h2>
        <button
          type="button"
          className={button + " disabled:opacity-50"}
          disabled={!onExport || exporting || !current}
          onClick={onExport}
          aria-describedby="repricing-export-note"
        >
          {copy.csv}
        </button>
      </div>
      <dl className="grid grid-cols-2 gap-5 md:grid-cols-4">
        {values.map(([label, value, type]) => (
          <div key={label}>
            <dt className="text-xs text-[var(--muted)]">{label}</dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums break-words">
              {format(value, type, locale)}
              {value !== undefined && value !== null && type === "money" ? (
                <small className="ml-1 text-xs">UAH</small>
              ) : null}
            </dd>
          </div>
        ))}
      </dl>
      <Note>{copy.basis}</Note>
      <p id="repricing-export-note" className="text-xs text-[var(--muted)]">
        {copy.csvReady}
      </p>
    </section>
  );
}
