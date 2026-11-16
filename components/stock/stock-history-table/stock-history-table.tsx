import { formatTableValue as format } from "@/lib/data-reporting-ui";
import type { StockHistoryCopy } from "../stock-history/copy";
import type { HistoryPoints } from "../stock-history/stock-history-types";
import { stockHistoryFormatters } from "../stock-history/stock-history-format";

export function StockHistoryTable({ points, copy, locale }: { points: HistoryPoints; copy: StockHistoryCopy; locale: string }) {
  const { date, time } = stockHistoryFormatters(locale);
  return (
    <details>
      <summary className="cursor-pointer py-2 text-sm focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-(--accent)">{copy.table}</summary>
      <div className="overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
          <caption className="sr-only">{copy.table}</caption>
          <thead><tr>{[copy.month, copy.cost, copy.qty, copy.coverage, copy.dates].map(label => <th key={label} scope="col" className="p-2 text-left">{label}</th>)}</tr></thead>
          <tbody>
            {points.flatMap(point => [point.current, point.priorYear]).map(point => (
              <tr key={point.date} className="border-t border-(--border)">
                <th scope="row" className="p-2 text-left font-normal whitespace-nowrap">{date(point.date)}</th>
                <td className="p-2">{point.stockCost === null ? copy.none : format(point.stockCost, "money", locale)}</td>
                <td className="p-2">{format(point.quantity, "quantity", locale)}</td>
                <td className="p-2">{point.observedCount} / {point.cohortSize}</td>
                <td className="p-2 whitespace-nowrap">{time(point.firstObservedAt)}<br />{time(point.lastObservedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
