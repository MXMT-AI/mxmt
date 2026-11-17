import type { OverviewCopy } from "@/lib/overview-copy";
import type { OverviewResponse, CurrencyBlock, OverviewLink, OverviewFormatters } from "../overview-types";
import { Link } from "@/i18n/navigation";
import { Heading } from "@/components/ui/heading/heading";
import { Note } from "@/components/ui/note/note";
import { button as reportButton } from "@/components/ui/button/button-styles";
import { cn } from "@/lib/utils";
import { OverviewValue } from "../overview-value/overview-value";
import { OverviewActionCard } from "../overview-action-card/overview-action-card";
import { fill, overviewBottleneckName } from "../overview-format";
const button = cn(reportButton, "mt-5 justify-start font-medium");

export function OverviewActions({ block, settings, monobrand, copy, money, pct, num, date, link }: OverviewFormatters & {
  block: CurrencyBlock;
  settings: NonNullable<OverviewResponse["overview"]>["settings"];
  monobrand: boolean;
  copy: OverviewCopy;
  link: OverviewLink;
}) {
  const dead = block.statuses.find((s) => s.status === "DEAD"),
    risk = block.statuses.find((s) => s.status === "RISK");
  const deadCount = dead?.skuCount ?? 0,
    riskCount = risk?.skuCount ?? 0;
  const shortage = block.statuses.reduce(
      (n, s) => n + s.shortageSkuCount,
      0,
    ),
    offSeason =
      block.statuses.find((s) => s.status === "OFF_SEASON")?.skuCount ??
      0;
  const bottleneck = block.bottleneck;
  const assessmentComplete = block.classificationCoverage.state === "COMPLETE";
  const countLabel = (count: number) => `${count > 0 || assessmentComplete ? count : "—"} ${copy.skus}`;
  const emptyClass = "mt-4 text-sm " + (assessmentComplete ? "text-report-positive" : "text-(--muted)");
  const cards = [
    {
      key: "dead",
      title: copy.dead,
      count: deadCount,
      value: money(dead ? dead.stockCost : assessmentComplete ? "0" : null),
      notes: [
        countLabel(deadCount),
        fill(copy.deadRule, {
          days: String(settings.deadDays),
          weeks: String(settings.riskWohWeeks),
        }),
      ],
      action: copy.reprice,
      href: () => link("/repricing", { classification: "DEAD" }),
      empty: copy.noDead,
    },
    {
      key: "risk",
      title: copy.risk,
      count: riskCount,
      value: money(risk ? risk.stockCost : assessmentComplete ? "0" : null),
      notes: [
        countLabel(riskCount),
        ...(riskCount > 0 ? [`${copy.woh}: ${num(risk?.minWoh)}–${num(risk?.maxWoh)} ${copy.weeks}`] : []),
      ],
      action: copy.viewRisk,
      href: () => link("/stock", { classification: "RISK" }),
      empty: copy.noRisk,
    },
    {
      key: "shortage",
      title: copy.shortage,
      count: shortage,
      value: countLabel(shortage),
      notes: [`${copy.offSeason}: ${offSeason}`],
      action: copy.reorder,
      href: () => link("/reordering", { mode: "shortage" }),
      empty: copy.noShortage,
    },
  ];
  return (
    <section aria-label={copy.actions}>
      <Heading as="h2" variant="compact" className="mb-4 text-base text-inherit">{copy.actions}</Heading>
      {!assessmentComplete ? (
        <p role="status" className="mb-4 text-sm text-(--muted)">
          {block.classificationCoverage.state === "PARTIAL"
            ? copy.classificationPartial : copy.classificationUnavailable}
        </p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(({ key, title, count, value, notes, action, href, empty }) => (
          <OverviewActionCard key={key} title={title}>
            <div className="mt-4">
              <OverviewValue>{value}</OverviewValue>
            </div>
            {notes.map((note) => <Note key={note} className="mt-2">{note}</Note>)}
            {count > 0 ? (
              <Link className={button} href={href()}>{action}</Link>
            ) : (
              <p className={emptyClass}>{assessmentComplete ? empty : copy.assessmentUnavailable}</p>
            )}
          </OverviewActionCard>
        ))}
        <OverviewActionCard title={copy.bottleneck}>
          {bottleneck ? (
            <>
              <h4
                translate="no"
                className="mt-4 font-semibold wrap-break-word"
              >
                {overviewBottleneckName(bottleneck, monobrand, copy)}
              </h4>
              <Note className="mt-2">
                {copy.stock}: {money(bottleneck.stockCost)} ·{" "}
                {num(bottleneck.quantity)} {copy.units}
              </Note>
              <Note className="mt-2">
                {copy.str}: {pct(bottleneck.sellThroughRatio)}
                {!bottleneck.strComplete ? ` (${copy.partial})` : ""}
              </Note>
              <Note className="mt-2">
                {copy.firstReceipt}:{" "}
                {bottleneck.firstReceiptDate
                  ? date(bottleneck.firstReceiptDate)
                  : copy.unavailable}
              </Note>
              <Link
                className={button}
                href={link("/stock", {
                  brandId: monobrand
                    ? null
                    : (bottleneck.brandId ?? "__unassigned__"),
                  categoryId: monobrand
                    ? (bottleneck.categoryId ?? "__unassigned__")
                    : null,
                  classification: null,
                })}
              >
                {monobrand ? copy.openCategory : copy.openBrand}
              </Link>
            </>
          ) : (
            <Note className="mt-2">
              {!assessmentComplete ? copy.assessmentUnavailable
                : deadCount > 0 ? copy.missingBottleneck : copy.noBottleneck}
            </Note>
          )}
        </OverviewActionCard>
      </div>
    </section>
  );
}
