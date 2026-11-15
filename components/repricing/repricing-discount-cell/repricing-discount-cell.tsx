import { formatTableValue as format } from "@/lib/data-reporting-ui";
import type { RepricingCopy } from "@/lib/repricing-copy";
import type { RepricingPreview } from "../use-repricing-preview";

export function RepricingDiscountCell({ row, copy, locale, settled }: {
  row: RepricingPreview["rows"][number];
  copy: RepricingCopy;
  locale: string;
  settled: boolean;
}) {
  if (!settled) return "—";
  return (
    <span>
      {format(row.effectiveDiscount, "percentage", locale)}
      {row.floorLimited ? (
        <small
          className={
            "text-report-warning block max-w-40 whitespace-normal"
          }
        >
          {copy.floor}
        </small>
      ) : null}
      {row.priceErrors.map((code) => (
        <small
          className={
            "text-report-negative block max-w-40 whitespace-normal"
          }
          key={code}
        >
          {code === "AUTOMATIC_PRICE_INCREASE"
            ? copy.priceIncreased
            : code === "NON_POSITIVE_PRICE"
              ? copy.nonPositive
              : code === "COST_FLOOR_VIOLATION"
                ? copy.costFloor
                : copy.belowCost}
        </small>
      ))}
    </span>
  );
}
