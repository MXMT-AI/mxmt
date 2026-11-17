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
  const hasNegative = rows.some(
    (r) => Number(r.current.revenue ?? 0) < 0 || Number(r.ly.revenue ?? 0) < 0,
  );
  const baseline = hasNegative ? 50 : 80;
  const maxHeight = hasNegative ? 38 : 65;
  const max = Math.max(
    1,
    ...rows.flatMap((r) => [
      Math.abs(Number(r.current.revenue ?? 0)),
      Math.abs(Number(r.ly.revenue ?? 0)),
    ]),
  );
  return (
    <figure className="mt-5">
      <figcaption className="text-xs text-(--muted)">
        {copy.trend} · {rows[0]?.month.slice(0, 4)}
      </figcaption>
      <svg
        viewBox={`0 0 ${rows.length * 26} 100`}
        role="img"
        aria-labelledby={titleId}
        className="mt-2 w-full max-h-28 overflow-visible"
      >
        <title id={titleId}>{`${copy.currentYear} / ${copy.priorYear}`}</title>
        <line
          x1="0"
          x2={rows.length * 26}
          y1={baseline}
          y2={baseline}
          stroke="var(--border)"
        />
        {rows.map((r, i) => (
          <g key={r.month}>
            {[
              { value: r.ly.revenue, x: i * 26 + 3, fill: "var(--muted)" },
              {
                value: r.current.revenue,
                x: i * 26 + 13,
                fill: i === rows.length - 1 ? "var(--accent)" : "var(--trend-fill)",
              },
            ].map((bar) => {
              if (bar.value === null) return null;
              const value = Number(bar.value),
                height = (Math.abs(value) / max) * maxHeight;
              return (
                <rect
                  key={bar.x}
                  x={bar.x}
                  y={value < 0 ? baseline : baseline - height}
                  width="8"
                  height={height}
                  fill={bar.fill}
                >
                  <title>{`${r.month}: ${money(bar.value)}`}</title>
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
              {new Intl.DateTimeFormat(locale, {
                month: "short",
                timeZone: "UTC",
              }).format(new Date(r.month + "-01T12:00:00Z"))}
            </text>
          </g>
        ))}
      </svg>
      <Note className="mt-2">
        {copy.currentYear} / {copy.priorYear}
      </Note>
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
            {rows.map((r) => (
              <tr key={r.month}>
                <th scope="row">{r.month}</th>
                <td>{money(r.current.revenue)}</td>
                <td>{money(r.ly.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
