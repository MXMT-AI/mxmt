import type { StockHistoryCopy } from "../stock-history/copy";
import type { FormattedHistoryPoints } from "../stock-history/stock-history-format";

export function StockHistoryTable({ points, copy }: { points: FormattedHistoryPoints; copy: StockHistoryCopy }) {
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
                <th scope="row" className="p-2 text-left font-normal whitespace-nowrap">{point.dateLabel}</th>
                <td className="p-2">{point.costLabel ?? copy.none}</td>
                <td className="p-2">{point.quantityLabel}</td>
                <td className="p-2">{point.observedCount} / {point.cohortSize}</td>
                <td className="p-2 whitespace-nowrap">{point.firstObservedLabel}<br />{point.lastObservedLabel}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
