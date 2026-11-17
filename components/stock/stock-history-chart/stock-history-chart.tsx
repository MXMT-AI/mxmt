"use client";
import { useId } from "react";
import { Text } from "@/components/ui/text/text";
import type { StockHistoryCopy } from "../stock-history/copy";
import type { FormattedHistoryPoints } from "../stock-history/stock-history-format";

export function StockHistoryChart({ points, currency, copy }: {
  points: FormattedHistoryPoints;
  currency: string | null;
  copy: StockHistoryCopy;
}) {
  const id = useId();
  const values = points.flatMap(({ current, priorYear }) => [current.cost, priorYear.cost])
    .filter(value => value !== null);
  const max = Math.max(1, ...values);
  return (
    <>
      {values.length === 0 && <Text variant="body" className="leading-normal text-(--muted)">{copy.none}</Text>}
      <svg viewBox="0 0 600 200" className="h-auto w-full" role="img" aria-labelledby={`${id}-title ${id}-description`}>
        <title id={`${id}-title`}>{`${copy.chart} · ${currency ?? "—"}`}</title>
        <desc id={`${id}-description`}>{copy.table}. {copy.basis}</desc>
        <path d="M24 16V176H580" fill="none" stroke="var(--border)" />
        {points.map((point, index) => {
          const x = 38 + index * 48;
          return (
            <g key={point.current.date}>
              {[{ point: point.current, color: "var(--accent)", dx: -4 }, { point: point.priorYear, color: "var(--muted)", dx: 4 }].map(({ point, color, dx }) => {
                const value = point.cost;
                return value !== null ? (
                  <circle key={dx} cx={x + dx} cy={168 - value / max * 140} r={4} fill={color}>
                    <title>{`${point.dateLabel}: ${point.costLabel}`}</title>
                  </circle>
                ) : null;
              })}
              <text x={x} y={194} textAnchor="middle" fontSize="10" fill="var(--muted)">{point.current.date.slice(5, 7)}</text>
            </g>
          );
        })}
      </svg>
    </>
  );
}
