import { stockStatusColors, stockStatusLabel as statusName } from "@/lib/merchandising-stock-display";
import type { Group } from "../stock-content/stock-content-types";
import type { StockCopy } from "@/lib/stock-copy";
import { formatTableValue as format } from "@/lib/data-reporting-ui";

export function StockStructure({
  row,
  copy,
  locale,
}: {
  row: Group;
  copy: StockCopy;
  locale: string;
}) {
  const label = row.statuses
    .filter((s) => s.skuCount > 0)
    .map(
      (s) =>
        `${statusName(copy, s.status)} ${format(s.share, "percentage", locale)}`,
    )
    .join(", ");
  return (
    <span
      role="img"
      aria-label={label || copy.empty}
      className="block h-2 w-36 rounded-sm overflow-hidden bg-(--input-bg)"
    >
      {row.statuses
        .filter((s) => s.share !== null && s.share !== "0")
        .map((s) => (
          <span
            key={s.status}
            aria-hidden="true"
            className="inline-block h-full align-top"
            style={{
              width: `${Number(s.share) * 100}%`,
              background: stockStatusColors[s.status],
            }}
          />
        ))}
    </span>
  );
}
