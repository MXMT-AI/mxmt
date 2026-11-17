"use client";
import { Heading } from "@/components/ui/heading/heading";
import { Text } from "@/components/ui/text/text";
import { useId } from "react";
import { Link } from "@/i18n/navigation";
import { Note } from "@/components/ui/note/note";
import { button } from "@/components/ui/button/button-styles";
import { StockCost } from "../stock-cost/stock-cost";
import { stockStatusColors, primaryStockStatuses as primary, stockStatusLabel as statusName } from "@/lib/merchandising-stock-display";
import type { Block, Href } from "../stock-content/stock-content-types";
import type { StockCopy } from "@/lib/stock-copy";
import { createTableValueFormatter } from "@/lib/data-reporting-ui";

const radius = 64;
const circumference = 2 * Math.PI * radius;

export function StockQualityRing({
  block,
  selected,
  copy,
  locale,
  href,
}: {
  block: Block;
  selected: string | null;
  copy: StockCopy;
  locale: string;
  href: Href;
}) {
  const titleId = useId();
  const formatValue = createTableValueFormatter(locale);
  const classificationHref = (classification: string | null) => href({
    classification,
    categoryPage: null,
    brandPage: null,
    page: null,
    categorySort: null,
    categoryDirection: null,
  });
  let offset = 0;
  const segments = primary.map((status) => {
    const row = block.statuses.find((entry) => entry.status === status);
    const length = Number(row?.ringShare ?? 0) * circumference;
    const start = offset;
    offset += length;
    return {
      status,
      row,
      length,
      start,
      color: stockStatusColors[status],
      label: statusName(copy, status),
      amount: formatValue(row ? row.stockCost : "0", "money"),
      share: formatValue(row?.ringShare, "percentage"),
      selected: selected === status,
    };
  });
  const active = segments.find((segment) => segment.selected && segment.row?.inRing);
  return (
    <div className="space-y-4 p-5">
      <Heading as="h3" variant="compact" className="text-base text-inherit">K1 · {copy.quality}</Heading>
      <div className="flex flex-col sm:flex-row items-center gap-5">
        <div className="relative w-48 h-48 shrink-0">
          <svg
            viewBox="0 0 180 180"
            className="w-full h-full"
            role="img"
            aria-labelledby={titleId}
          >
            <title id={titleId}>{copy.quality + " · " + copy.ringBasis}</title>
            <circle
              cx="90"
              cy="90"
              r={radius}
              fill="none"
              stroke="var(--border)"
              strokeWidth="30"
            />
            {segments.map(({ status, color, length, start, label, amount, share }) => (
              <circle
                key={status}
                cx="90"
                cy="90"
                r={radius}
                fill="none"
                stroke={color}
                strokeWidth="30"
                strokeDasharray={`${length} ${circumference - length}`}
                strokeDashoffset={-start}
                transform="rotate(-90 90 90)"
              >
                <title>{`${label}: ${amount} · ${share}`}</title>
              </circle>
            ))}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-10">
            <strong className="text-xl tabular-nums leading-tight wrap-break-word">
              {active ? active.share : formatValue(block.ringCost, "money")}
            </strong>
            <span className="mt-1 text-xs text-(--muted)">
              {active?.label ?? copy.cost}
            </span>
            <span className="text-xs mt-1">
              {active?.row?.skuCount ?? block.ringSkuCount} {copy.skus}
            </span>
          </div>
        </div>
        <div className="min-w-0 w-full space-y-2">
          {segments.map(({ status, row, selected, color, label, amount, share }) => (
            <Link
              key={status}
              aria-current={selected ? "true" : undefined}
              href={classificationHref(selected ? null : status)}
              className={
                button +
                " w-full justify-between gap-2 " +
                (selected
                  ? " bg-(--input-bg) ring-1 ring-(--accent)"
                  : "")
              }
            >
              <span className="inline-flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="w-2.5 h-2.5 rounded-xs shrink-0"
                  style={{ background: color }}
                />
                {label}{" "}
                <span className="text-xs text-(--muted)">
                  {row?.skuCount ?? 0} {copy.skus}
                </span>
              </span>
              <span className="text-right tabular-nums">
                {amount}
                <small className="block text-(--muted)">
                  {share}
                </small>
              </span>
            </Link>
          ))}
          <Link
            className={button + " w-full"}
            href={classificationHref(null)}
          >
            {copy.all}
          </Link>
        </div>
      </div>
      <Note>{copy.ringBasis}</Note>
      {block.ringCost === null ? (
        <Text variant="body" className="leading-normal text-base text-inherit text-sm">
          {copy.partial} · {copy.covered}:{" "}
          {formatValue(block.coveredRingCost, "money")}
        </Text>
      ) : null}
      <div className="border-t border-(--border) pt-4 space-y-3">
        <Heading as="h4" variant="compact" className="text-inherit">{copy.outside}</Heading>
        <ul className="space-y-2 text-xs">
          {block.statuses
            .filter((r) => !r.inRing)
            .map((r) => (
              <li key={r.status} className="flex justify-between gap-3">
                <Link
                  className="underline underline-offset-4"
                  href={classificationHref(r.status)}
                >
                  {statusName(copy, r.status)} · {r.skuCount} {copy.skus}
                </Link>
                <span className="text-right tabular-nums">
                  {r.status === "SERVICE" ? (
                    formatValue(null, "money")
                  ) : (
                    <StockCost
                      value={r.stockCost}
                      covered={
                        r.physicalSkuCount ? r.coveredStockCost : undefined
                      }
                      formatValue={formatValue}
                      copy={copy}
                    />
                  )}
                </span>
              </li>
            ))}
        </ul>
        <Note>{copy.outsideBasis}</Note>
      </div>
      <Note>{copy.overviewBasis}</Note>
      <Note>
        {copy.gray}: {formatValue(block.grayCost, "money")}
      </Note>
    </div>
  );
}
