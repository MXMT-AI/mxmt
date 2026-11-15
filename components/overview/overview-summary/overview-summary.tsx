import type { OverviewCopy } from "@/lib/overview-copy";
import type { OverviewResponse, CurrencyBlock, OverviewFormatters } from "../overview-types";
import { fill } from "../overview-format";

export function OverviewSummary({ block, sale, monobrand, copy, locale, money, pct }: {
  block: CurrencyBlock;
  sale: NonNullable<OverviewResponse["sales"]>["summary"][number] | undefined;
  monobrand: boolean;
  copy: OverviewCopy;
  locale: string;
  money: OverviewFormatters["money"];
  pct: OverviewFormatters["pct"];
}) {
  const dead = block.statuses.find(s => s.status === "DEAD");
  const bottleneck = block.bottleneck;
  const revenueSentence =
    sale?.revenueChangePct != null
      ? fill(copy.revenueSentence, {
          change:
            (sale.revenueChangePct.startsWith("-") ? "" : "+") +
            pct(sale.revenueChangePct),
        })
      : sale?.plan.attainmentPct != null
        ? fill(copy.planSentence, { value: pct(sale.plan.attainmentPct) })
        : null;
  return (
    <section
      aria-label={copy.summary}
      className="overview-summary rounded-xl bg-(--summary-bg) p-5 md:p-6 text-(--summary-ink) space-y-3 text-sm leading-relaxed wrap-break-word"
    >
      {revenueSentence ? (
        <p>
          {revenueSentence}.
          {block.contributors.length ? (
            <>
              {" "}
              {copy.contributors}:{" "}
              {block.contributors.map((b, i) => (
                <span key={b.id ?? "unassigned"}>
                  {i ? ", " : ""}
                  <strong translate="no">
                    {b.id === null ? copy.unknownBrand : b.name}
                  </strong>{" "}
                  {money(b.delta)}
                  {b.oneOffLy ? ` (${copy.oneOff})` : ""}
                </span>
              ))}
              .
            </>
          ) : null}
        </p>
      ) : null}
      {block.deadShare !== null ? (
        <p>
          {fill(copy.deadSentence, {
            share: pct(block.deadShare),
            amount: money(dead ? dead.stockCost : "0"),
          })}
          .
          {bottleneck ? (
            <>
              {" "}
              {fill(copy.bottleneckSentence, {
                brand:
                  (monobrand
                    ? bottleneck.categoryId
                    : bottleneck.brandId) === null
                    ? monobrand
                      ? copy.unknownCategory
                      : copy.unknownBrand
                    : bottleneck.name,
                amount: money(bottleneck.stockCost),
              })}
              ; {copy.str.toLocaleLowerCase(locale)}:{" "}
              {pct(bottleneck.sellThroughRatio)}
              {!bottleneck.strComplete ? ` (${copy.partial})` : ""}.
            </>
          ) : null}
        </p>
      ) : null}
      {!revenueSentence && block.deadShare === null ? (
        <p>{copy.noSummary}</p>
      ) : null}
    </section>
  );
}
