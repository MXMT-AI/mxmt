"use client";
import { Heading } from "@/components/ui/heading/heading";
import { panel } from "@/components/ui/panel/panel-styles";
import { Button } from "@/components/ui/button/button";
import { MetricTile } from "@/components/ui/metric-tile/metric-tile";
import { Note } from "@/components/ui/note/note";
import { formatTableValue as format } from "@/lib/data-reporting-ui";
import type { ReorderingCopy } from "@/lib/reordering-copy";
import type { ReorderingPreview } from "../reordering-editor/reordering-editor";
export default function ReorderingSummary({
  data,
  current,
  copy,
  locale,
  onExport,
  exporting = false,
}: {
  data: ReorderingPreview | null;
  current: boolean;
  copy: ReorderingCopy;
  locale: string;
  onExport?: () => void;
  exporting?: boolean;
}) {
  const result = current ? data : null;
  return (
    <section
      data-metric="reordering"
      className={panel + " scenario-summary p-5 space-y-4"}
      aria-labelledby="reordering-summary"
      aria-busy={!current}
    >
      <div className="flex flex-wrap justify-between items-center gap-3">
        <Heading as="h2" variant="compact" className="text-base text-inherit" id="reordering-summary">
          {copy.summary}
        </Heading>
        <Button
          variant="report"
          disabled={!onExport || exporting || !current}
          onClick={onExport}
          aria-describedby="reordering-csv-note"
        >
          {copy.csv}
        </Button>
      </div>
      <dl className="grid grid-cols-2 gap-5 md:grid-cols-4">
        {[
          { key: "totalUnits", label: copy.totalUnits, value: result?.totals.quantity, primary: true },
          { key: "knownUnits", label: copy.knownUnits, value: result?.totals.knownQuantity },
          { key: "shortageCount", label: copy.shortageCount, value: result?.counts.shortageSkuCount },
          { key: "reviewCount", label: copy.reviewCount, value: result?.counts.reviewSkuCount },
          { key: "offSeasonCount", label: copy.offSeasonCount, value: result?.counts.offSeasonSkuCount },
        ].map(({ key, label, value, primary }) => (
          <MetricTile
            key={key}
            variant="scenario"
            label={label}
            value={format(value, "quantity", locale)}
            valueClassName={primary ? "scenario-key-value" : undefined}
          />
        ))}
      </dl>
      {result?.currencies.map((currency) => (
        <div
          key={currency.currency ?? "unknown"}
          className="border-t border-(--border) pt-3"
        >
          <strong translate="no">{currency.currency ?? copy.unknown}</strong>
          <p className="mt-1 text-sm">
            {copy.amount}: <strong className="scenario-key-value tabular-nums">{format(currency.purchaseAmount, "money", locale)}</strong>
          </p>
          {currency.unknownAmountSkuCount > 0 ? (
            <>
              <p className="text-xs">{copy.partial}</p>
              <Note>
                {copy.covered}:{" "}
                {format(currency.coveredPurchaseAmount, "money", locale)}
              </Note>
            </>
          ) : null}
        </div>
      ))}
      <Note>{copy.globalBasis}</Note>
      <Note id="reordering-csv-note" className="leading-4">
        {copy.csvReady}
      </Note>
    </section>
  );
}
