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
import { formatTableValue as format } from "@/lib/data-reporting-ui";

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
  const titleId = useId(),
    circumference = 2 * Math.PI * 64;
  let offset = 0;
  const active = block.statuses.find((r) => r.status === selected && r.inRing);
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
              r="64"
              fill="none"
              stroke="var(--border)"
              strokeWidth="30"
            />
            {primary.map((status) => {
              const row = block.statuses.find((r) => r.status === status),
                length = Number(row?.ringShare ?? 0) * circumference,
                start = offset;
              offset += length;
              return (
                <circle
                  key={status}
                  cx="90"
                  cy="90"
                  r="64"
                  fill="none"
                  stroke={stockStatusColors[status]}
                  strokeWidth="30"
                  strokeDasharray={`${length} ${circumference - length}`}
                  strokeDashoffset={-start}
                  transform="rotate(-90 90 90)"
                >
                  <title>{`${statusName(copy, status)}: ${format(row ? row.stockCost : "0", "money", locale)} · ${format(row?.ringShare, "percentage", locale)}`}</title>
                </circle>
              );
            })}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-10">
            <strong className="text-xl tabular-nums leading-tight wrap-break-word">
              {active
                ? format(active.ringShare, "percentage", locale)
                : format(block.ringCost, "money", locale)}
            </strong>
            <span className="mt-1 text-xs text-(--muted)">
              {active ? statusName(copy, active.status) : copy.cost}
            </span>
            <span className="text-xs mt-1">
              {active ? active.skuCount : block.ringSkuCount} {copy.skus}
            </span>
          </div>
        </div>
        <div className="min-w-0 w-full space-y-2">
          {primary.map((status) => {
            const row = block.statuses.find((r) => r.status === status);
            return (
              <Link
                key={status}
                aria-current={selected === status ? "true" : undefined}
                href={href({
                  classification: selected === status ? null : status,
                  categoryPage: null,
                  brandPage: null,
                  page: null,
                  categorySort: null,
                  categoryDirection: null,
                })}
                className={
                  button +
                  " w-full justify-between gap-2 " +
                  (selected === status
                    ? " bg-(--input-bg) ring-1 ring-(--accent)"
                    : "")
                }
              >
                <span className="inline-flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="w-2.5 h-2.5 rounded-xs shrink-0"
                    style={{ background: stockStatusColors[status] }}
                  />
                  {statusName(copy, status)}{" "}
                  <span className="text-xs text-(--muted)">
                    {row?.skuCount ?? 0} {copy.skus}
                  </span>
                </span>
                <span className="text-right tabular-nums">
                  {format(row ? row.stockCost : "0", "money", locale)}
                  <small className="block text-(--muted)">
                    {format(row?.ringShare, "percentage", locale)}
                  </small>
                </span>
              </Link>
            );
          })}
          <Link
            className={button + " w-full"}
            href={href({
              classification: null,
              categoryPage: null,
              brandPage: null,
              page: null,
              categorySort: null,
              categoryDirection: null,
            })}
          >
            {copy.all}
          </Link>
        </div>
      </div>
      <Note>{copy.ringBasis}</Note>
      {block.ringCost === null ? (
        <Text variant="body" className="leading-normal text-base text-inherit text-sm">
          {copy.partial} · {copy.covered}:{" "}
          {format(block.coveredRingCost, "money", locale)}
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
                  href={href({
                    classification: r.status,
                    categoryPage: null,
                    brandPage: null,
                    page: null,
                    categorySort: null,
                    categoryDirection: null,
                  })}
                >
                  {statusName(copy, r.status)} · {r.skuCount} {copy.skus}
                </Link>
                <span className="text-right tabular-nums">
                  {r.status === "SERVICE" ? (
                    format(null, "money", locale)
                  ) : (
                    <StockCost
                      value={r.stockCost}
                      covered={
                        r.physicalSkuCount ? r.coveredStockCost : undefined
                      }
                      locale={locale}
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
        {copy.gray}: {format(block.grayCost, "money", locale)}
      </Note>
    </div>
  );
}
