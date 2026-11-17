import { Heading } from "@/components/ui/heading/heading";
import { panel } from "@/components/ui/panel/panel-styles";
import { Button } from "@/components/ui/button/button";
import { MetricTile } from "@/components/ui/metric-tile/metric-tile";
import { Note } from "@/components/ui/note/note";
import { formatTableValue as format } from "@/lib/data-reporting-ui";
import type { RepricingCopy } from "@/lib/repricing-copy";
import type { RepricingPreview } from "../use-repricing-preview";
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
  const noEligible = current && data?.counts.eligibleSkuCount === 0;
  const values = [
    { key: "capital", label: copy.capital, value: totals?.costCapital, type: "money", primary: false },
    { key: "revenue", label: copy.revenue, value: totals?.potentialRevenue, type: "money", primary: true },
    { key: "weighted", label: copy.weighted, value: totals?.weightedDiscount, type: "percentage", primary: false },
    { key: "profit", label: copy.profit, value: totals?.grossProfit, type: "money", primary: false },
    { key: "grossMargin", label: copy.grossMargin, value: totals?.grossMargin, type: "percentage", primary: false },
    { key: "selectedSkus", label: copy.selectedSkus, value: totals?.skuCount, type: "number", primary: false },
    { key: "duration", label: copy.duration, value: totals?.durationDays, type: "number", primary: false },
  ] as const;
  return (
    <section
      data-metric="repricing"
      className={panel + " scenario-summary p-5 space-y-4"}
      aria-labelledby="repricing-summary"
      aria-busy={!current}
    >
      <div className="flex flex-wrap justify-between items-center gap-3">
        <Heading as="h2" variant="compact" id="repricing-summary" className="text-base text-inherit">
          {copy.summary}
        </Heading>
        <Button
          variant="report"
          disabled={!onExport || exporting || !current}
          onClick={onExport}
          aria-describedby="repricing-export-note"
        >
          {copy.csv}
        </Button>
      </div>
      <dl className="grid grid-cols-2 gap-5 md:grid-cols-4">
        {values.map(({ key, label, value, type, primary }) => (
          <MetricTile
            key={key}
            variant="scenario"
            label={label}
            valueClassName={`wrap-break-word ${primary ? "scenario-key-value" : ""}`}
            value={
              <>
                {format(noEligible && type === "money" ? null : value, type, locale)}
                {!noEligible && value !== undefined && value !== null && type === "money" ? (
                  <small className="ml-1 text-xs">UAH</small>
                ) : null}
              </>
            }
          />
        ))}
      </dl>
      <Note>{copy.basis}</Note>
      <Note id="repricing-export-note" className="leading-4">
        {copy.csvReady}
      </Note>
    </section>
  );
}
