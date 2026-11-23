import { createReportMonthFormatter } from "@/lib/data-reporting-ui";
import { useId } from "react";
import type { OverviewCopy } from "@/lib/overview-copy";
import type { OverviewModel } from "@/lib/merchandising-overview";
import { Note } from "@/components/ui/note/note";

type CurrencyBlock = OverviewModel["byCurrency"][number];

export function OverviewTrend({
  rows,
  history,
  locale,
  money,
  copy,
}: {
  rows: NonNullable<CurrencyBlock["trend"]>;
  history: CurrencyBlock["trendHistory"];
  locale: string;
  money: (v: string | null) => string;
  copy: OverviewCopy;
}) {
  const titleId = useId();
  const formatMonth = createReportMonthFormatter(locale);
  const yearLabels = `${copy.currentYear} / ${copy.priorYear}`;
  const chartWidth = rows.length * 26;
  let hasNegative = false;
  let max = 1;
  const months = rows.map(({ month, current, ly }) => {
    const currentValue = current.revenue === null ? null : Number(current.revenue);
    const priorValue = ly.revenue === null ? null : Number(ly.revenue);
    hasNegative ||= (currentValue ?? 0) < 0 || (priorValue ?? 0) < 0;
    max = Math.max(max, Math.abs(currentValue ?? 0), Math.abs(priorValue ?? 0));
    return {
      month,
      currentValue,
      priorValue,
      currentLabel: money(current.revenue),
      priorLabel: money(ly.revenue),
    };
  });
  const baseline = hasNegative ? 50 : 80;
  const maxHeight = hasNegative ? 38 : 65;
  return (
    <figure className="mt-5">
      <figcaption className="text-xs text-(--muted)">
        {copy.trend} · {rows[0]?.month.slice(0, 4)}
      </figcaption>
      <svg
        viewBox={`0 0 ${chartWidth} 100`}
        role="img"
        aria-labelledby={titleId}
        className="mt-2 w-full max-h-28 overflow-visible"
      >
        <title id={titleId}>{yearLabels}</title>
        <line
          x1="0"
          x2={chartWidth}
          y1={baseline}
          y2={baseline}
          stroke="var(--border)"
        />
        {months.map(({ month, currentValue, priorValue, currentLabel, priorLabel }, i) => (
          <g key={month}>
            {[
              { value: priorValue, label: priorLabel, x: i * 26 + 3, fill: "var(--muted)" },
              {
                value: currentValue,
                label: currentLabel,
                x: i * 26 + 13,
                fill: i === months.length - 1 ? "var(--accent)" : "var(--trend-fill)",
              },
            ].map(({ value, label, x, fill }) => {
              if (value === null) return null;
              const height = (Math.abs(value) / max) * maxHeight;
              return (
                <rect
                  key={x}
                  x={x}
                  y={value < 0 ? baseline : baseline - height}
                  width="8"
                  height={height}
                  fill={fill}
                >
                  <title>{`${month}: ${label}`}</title>
                </rect>
              );
            })}
            <text
              x={i * 26 + 12}
              y="98"
              textAnchor="middle"
              fontSize="9"
              fill="var(--muted)"
            >
              {formatMonth(month)}
            </text>
          </g>
        ))}
      </svg>
      <Note className="mt-2">{yearLabels}</Note>
      {!history?.current ||
      !history?.ly ||
      rows.some(
        (r) =>
          r.current.missingRevenueCount > 0 || r.ly.missingRevenueCount > 0,
      ) ? (
        <Note className="mt-2">{copy.historyPartial}</Note>
      ) : null}
      <div className="sr-only">
        <table>
          <caption>{copy.trend}</caption>
          <thead>
            <tr>
              <th scope="col">{copy.month}</th>
              <th scope="col">{copy.currentYear}</th>
              <th scope="col">{copy.priorYear}</th>
            </tr>
          </thead>
          <tbody>
            {months.map(({ month, currentLabel, priorLabel }) => (
              <tr key={month}>
                <th scope="row">{month}</th>
                <td>{currentLabel}</td>
                <td>{priorLabel}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
