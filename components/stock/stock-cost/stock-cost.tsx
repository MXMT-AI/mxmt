import { PartialMarker } from "@/components/ui/partial-marker/partial-marker";
import type { StockCopy } from "@/lib/stock-copy";
import type { createTableValueFormatter } from "@/lib/data-reporting-ui";

export function StockCost({
  value,
  covered,
  formatValue,
  copy,
}: {
  value: string | null;
  covered?: string;
  formatValue: ReturnType<typeof createTableValueFormatter>;
  copy: Pick<StockCopy, "partial" | "covered">;
}) {
  return (
    <>
      {formatValue(value, "money")}
      {value === null ? (
        <>
          <PartialMarker label={copy.partial} />
          {covered !== undefined ? (
            <small className="block text-(--muted)">
              {copy.covered}: {formatValue(covered, "money")}
            </small>
          ) : null}
        </>
      ) : null}
    </>
  );
}
