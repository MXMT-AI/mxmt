import type { OverviewCopy } from "@/lib/overview-copy";
import type { OverviewResponse, CurrencyBlock, OverviewLink, OverviewFormatters } from "../overview-types";
import { Link } from "@/i18n/navigation";
import { Note } from "@/components/ui/note/note";
import { button as reportButton } from "@/components/ui/button/button-styles";
import { cn } from "@/lib/utils";
import { OverviewValue } from "../overview-value/overview-value";
import { OverviewActionCard } from "../overview-action-card/overview-action-card";
import { fill } from "../overview-format";
const button = cn(reportButton, "justify-start font-medium");

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
  return (
    <section aria-label={copy.actions}>
      <h2 className="mb-4 font-semibold">{copy.actions}</h2>
      {!assessmentComplete ? (
        <p role="status" className="mb-4 text-sm text-(--muted)">
          {block.classificationCoverage.state === "PARTIAL"
            ? copy.classificationPartial : copy.classificationUnavailable}
        </p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <OverviewActionCard title={copy.dead}>
          <div className="mt-4">
            <OverviewValue>{money(dead ? dead.stockCost : assessmentComplete ? "0" : null)}</OverviewValue>
          </div>
          <Note className="mt-2">
            {deadCount > 0 || assessmentComplete ? deadCount : "—"} {copy.skus}
          </Note>
          <Note className="mt-2">
            {fill(copy.deadRule, {
              days: String(settings.deadDays),
              weeks: String(settings.riskWohWeeks),
            })}
          </Note>
          {deadCount > 0 ? (
            <Link
              className={button + " mt-5"}
              href={link("/repricing", { classification: "DEAD" })}
            >
              {copy.reprice}
            </Link>
          ) : (
            <p className={"mt-4 text-sm " + (assessmentComplete ? "text-report-positive" : "text-(--muted)")}>
              {assessmentComplete ? copy.noDead : copy.assessmentUnavailable}
            </p>
          )}
        </OverviewActionCard>
        <OverviewActionCard title={copy.risk}>
          <div className="mt-4">
            <OverviewValue>{money(risk ? risk.stockCost : assessmentComplete ? "0" : null)}</OverviewValue>
          </div>
          <Note className="mt-2">
            {riskCount > 0 || assessmentComplete ? riskCount : "—"} {copy.skus}
          </Note>
          {riskCount > 0 ? (
            <>
              <Note className="mt-2">
                {copy.woh}: {num(risk?.minWoh)}–{num(risk?.maxWoh)}{" "}
                {copy.weeks}
              </Note>
              <Link
                className={button + " mt-5"}
                href={link("/stock", { classification: "RISK" })}
              >
                {copy.viewRisk}
              </Link>
            </>
          ) : (
            <p className={"mt-4 text-sm " + (assessmentComplete ? "text-report-positive" : "text-(--muted)")}>
              {assessmentComplete ? copy.noRisk : copy.assessmentUnavailable}
            </p>
          )}
        </OverviewActionCard>
        <OverviewActionCard title={copy.shortage}>
          <div className="mt-4">
            <OverviewValue>
              {shortage > 0 || assessmentComplete ? shortage : "—"} {copy.skus}
            </OverviewValue>
          </div>
          <Note className="mt-2">
            {copy.offSeason}: {offSeason}
          </Note>
          {shortage > 0 ? (
            <Link
              className={button + " mt-5"}
              href={link("/reordering", { mode: "shortage" })}
            >
              {copy.reorder}
            </Link>
          ) : (
            <p className={"mt-4 text-sm " + (assessmentComplete ? "text-report-positive" : "text-(--muted)")}>
              {assessmentComplete ? copy.noShortage : copy.assessmentUnavailable}
            </p>
          )}
        </OverviewActionCard>
        <OverviewActionCard title={copy.bottleneck}>
          {bottleneck ? (
            <>
              <h4
                translate="no"
                className="mt-4 font-semibold wrap-break-word"
              >
                {(monobrand
                  ? bottleneck.categoryId
                  : bottleneck.brandId) === null
                  ? monobrand
                    ? copy.unknownCategory
                    : copy.unknownBrand
                  : bottleneck.name}
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
                className={button + " mt-5"}
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
