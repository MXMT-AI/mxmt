"use client";

import { useId } from "react";
import { Link } from "@/i18n/navigation";
import { Note } from "@/components/ui/note/note";
import { formatTableValue } from "@/lib/data-reporting-ui";
import type { SalesCopy } from "@/lib/sales-copy";
import type { SalesCurrencyBlock, SalesHref } from "../sales-types";
import { SalesMatrix } from "../sales-matrix/sales-matrix";

const categoryColors = [
  "var(--chart-series-1, #779ab5)",
  "var(--chart-series-2, #87a88c)",
  "var(--chart-series-3, #c4a36e)",
  "var(--chart-series-4, #a08eb5)",
  "var(--chart-series-5, #9a9ea4)",
];
export function SalesCategoryChart({
  rows,
  locale,
  copy,
  units,
  href,
}: {
  rows: SalesCurrencyBlock["categories"];
  locale: string;
  copy: SalesCopy;
  units: boolean;
  href: SalesHref;
}) {
  const titleId = useId(),
    groups = rows
      .filter((r) => r.kind !== "TOTAL")
      .sort((a, b) =>
        a.kind === "OTHERS" ? 1 : b.kind === "OTHERS" ? -1 : a.rank - b.rank,
      ),
    total = rows.find((r) => r.kind === "TOTAL"),
    months = (total ?? groups[0])?.cells.map((c) => c.month) ?? [];
  const extents = months.map((_, i) =>
    groups.reduce(
      (a, r) => {
        const n = Number(r.cells[i].value ?? 0);
        return {
          positive: a.positive + Math.max(n, 0),
          negative: a.negative + Math.min(n, 0),
        };
      },
      { positive: 0, negative: 0 },
    ),
  );
  const max = Math.max(1, ...extents.map((e) => e.positive)),
    min = Math.min(0, ...extents.map((e) => e.negative)),
    height = 100,
    scale = height / (max - min),
    baseline = max * scale;
  const monthFormatter = new Intl.DateTimeFormat(locale, {
    month: "short",
    timeZone: "UTC",
  });
  return (
    <figure className="p-5 space-y-4">
      <figcaption className="text-xs text-(--muted)">
        {units ? copy.units : copy.revenue} · {copy.chartScope}
      </figcaption>
      {groups.some((r) => r.cells.some((c) => c.partial)) ? (
        <Note>{copy.partial}</Note>
      ) : null}
      {months.length ? (
        <svg
          className="w-full h-44"
          viewBox={`0 -4 ${Math.max(1, months.length) * 28} 125`}
          role="img"
          aria-labelledby={titleId}
        >
          <title
            id={titleId}
          >{`${copy.categories} — ${units ? copy.units : copy.revenue}`}</title>
          <line
            x1="0"
            x2={months.length * 28}
            y1={baseline}
            y2={baseline}
            stroke="var(--border)"
          />
          {months.map((month, i) => {
            let positive = 0,
              negative = 0;
            return (
              <g key={month}>
                {groups.map((r, j) => {
                  const n = Number(r.cells[i].value ?? 0),
                    top =
                      n >= 0
                        ? baseline - (positive + n) * scale
                        : baseline - negative * scale;
                  if (n >= 0) positive += n;
                  else negative += n;
                  return r.cells[i].value === null ? null : (
                    <rect
                      key={r.kind + ":" + r.id}
                      x={i * 28 + 5}
                      y={top}
                      width="18"
                      height={Math.abs(n) * scale}
                      fill={categoryColors[j]}
                    >
                      <title>{`${r.kind === "OTHERS" ? copy.others : r.name} · ${month}: ${formatTableValue(r.cells[i].value, units ? "quantity" : "money", locale)}`}</title>
                    </rect>
                  );
                })}
                <text
                  x={i * 28 + 14}
                  y="117"
                  textAnchor="middle"
                  fontSize="8"
                  fill="var(--muted)"
                >
                  {monthFormatter.format(new Date(month + "-01T12:00:00Z"))}
                </text>
              </g>
            );
          })}
        </svg>
      ) : (
        <p>{copy.noRows}</p>
      )}
      <ul className="flex flex-wrap gap-x-4 gap-y-2 text-xs">
        {groups.map((r, i) => (
          <li key={r.kind + ":" + r.id} className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="inline-block h-2 w-2 rounded-xs"
              style={{ background: categoryColors[i] }}
            />
            {r.kind === "OTHERS" ? (
              copy.others
            ) : (
              <Link
                className="underline underline-offset-4"
                href={href({
                  categoryId: r.id ?? "__unassigned__",
                  groupBy: "sku",
                  others: null,
                  page: null,
                })}
              >
                {r.id === null ? copy.unassigned : r.name}
              </Link>
            )}
          </li>
        ))}
      </ul>
      <details>
        <summary className="cursor-pointer py-2 text-sm underline underline-offset-4">
          {copy.details}
        </summary>
        <SalesMatrix
          rows={groups}
          total={total}
          metric={units ? "units" : "revenue"}
          group="category"
          copy={copy}
          locale={locale}
          href={href}
        />
      </details>
    </figure>
  );
}
