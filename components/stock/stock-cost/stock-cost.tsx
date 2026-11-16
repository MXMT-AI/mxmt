import { PartialMarker } from "@/components/ui/partial-marker/partial-marker";
import type { StockCopy } from "@/lib/stock-copy";
import { formatTableValue as format } from "@/lib/data-reporting-ui";

export function StockCost({
  value,
  covered,
  locale,
  copy,
}: {
  value: string | null;
  covered?: string;
  locale: string;
  copy: StockCopy;
}) {
  return (
    <>
      {format(value, "money", locale)}
      {value === null ? (
        <>
          <PartialMarker label={copy.partial} />
          {covered !== undefined ? (
            <small className="block text-(--muted)">
              {copy.covered}: {format(covered, "money", locale)}
            </small>
          ) : null}
        </>
      ) : null}
    </>
  );
}
