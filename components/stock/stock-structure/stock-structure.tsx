import { stockStatusLabel as statusName } from "@/lib/merchandising-stock-display";
import type { Group } from "../stock-content/stock-content-types";
import type { StockCopy } from "@/lib/stock-copy";
import type { createTableValueFormatter } from "@/lib/data-reporting-ui";
import { StockShareBar } from "../stock-share-bar/stock-share-bar";

export function StockStructure({
  statuses,
  copy,
  formatValue,
}: {
  statuses: readonly Pick<Group["statuses"][number], "status" | "share" | "skuCount">[];
  copy: StockCopy;
  formatValue: ReturnType<typeof createTableValueFormatter>;
}) {
  const label = statuses
    .filter((s) => s.skuCount > 0)
    .map(
      (s) =>
        `${statusName(copy, s.status)} ${formatValue(s.share, "percentage")}`,
    )
    .join(", ");
  return <StockShareBar statuses={statuses} label={label || copy.empty} className="w-36" />;
}
