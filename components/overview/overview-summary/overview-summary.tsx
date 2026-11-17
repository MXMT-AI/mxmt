import type { OverviewCopy } from "@/lib/overview-copy";
import { Text } from "@/components/ui/text/text";
import type { OverviewResponse, CurrencyBlock, OverviewFormatters } from "../overview-types";
import { fill, overviewBottleneckName } from "../overview-format";

export function OverviewSummary({ block, sale, monobrand, copy, locale, money, pct }: {
  block: CurrencyBlock;
  sale: NonNullable<OverviewResponse["sales"]>["summary"][number] | undefined;
  monobrand: boolean;
  copy: OverviewCopy;
  locale: string;
  money: OverviewFormatters["money"];
  pct: OverviewFormatters["pct"];
}) {
  const { contributors, deadShare, bottleneck } = block;
  const revenueChange = sale?.revenueChangePct;
  const planAttainment = sale?.plan.attainmentPct;
  const revenueSentence =
    revenueChange != null
      ? fill(copy.revenueSentence, {
          change: (revenueChange.startsWith("-") ? "" : "+") + pct(revenueChange),
        })
      : planAttainment != null
        ? fill(copy.planSentence, { value: pct(planAttainment) })
        : null;

  let stockSentence: string | null = null;
  if (deadShare !== null) {
    const dead = block.statuses.find((status) => status.status === "DEAD");
    stockSentence = fill(copy.deadSentence, {
      share: pct(deadShare),
      amount: money(dead ? dead.stockCost : "0"),
    }) + ".";

    if (bottleneck) {
      const sentence = fill(copy.bottleneckSentence, {
        brand: overviewBottleneckName(bottleneck, monobrand, copy),
        amount: money(bottleneck.stockCost),
      });
      const sellThrough = pct(bottleneck.sellThroughRatio);
      const partial = bottleneck.strComplete ? "" : ` (${copy.partial})`;
      stockSentence += ` ${sentence}; ${copy.str.toLocaleLowerCase(locale)}: ${sellThrough}${partial}.`;
    }
  }

  return (
    <section
      aria-label={copy.summary}
      className="overview-summary rounded-xl bg-(--summary-bg) p-5 md:p-6 text-(--summary-ink) space-y-3 wrap-break-word"
    >
      {revenueSentence ? (
        <Text variant="body" className="text-inherit">
          {revenueSentence}.
          {contributors.length ? (
            <>
              {" "}
              {copy.contributors}:{" "}
              {contributors.map((b, i) => (
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
        </Text>
      ) : null}
      {stockSentence !== null ? (
        <Text variant="body" className="text-inherit">{stockSentence}</Text>
      ) : null}
      {!revenueSentence && stockSentence === null ? (
        <Text variant="body" className="text-inherit">{copy.noSummary}</Text>
      ) : null}
    </section>
  );
}
