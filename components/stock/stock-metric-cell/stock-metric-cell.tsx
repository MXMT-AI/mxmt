import { PartialMarker } from "@/components/ui/partial-marker/partial-marker";
import type { DataColumnMetadata } from "@/lib/data-table-api";
import type { createTableValueFormatter } from "@/lib/data-reporting-ui";

export function StockMetricCell({ row, column, formatValue, partialLabel }: {
  row: Record<string, unknown>;
  column: Pick<DataColumnMetadata, "key" | "type">;
  formatValue: ReturnType<typeof createTableValueFormatter>;
  partialLabel: string;
}) {
  return (
    <>
      {formatValue(row[column.key], column.type)}
      {column.key === "sellThroughRatio" && !row.strComplete ? (
        <PartialMarker label={partialLabel} />
      ) : null}
    </>
  );
}
