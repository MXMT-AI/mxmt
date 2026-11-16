import { Heading } from "@/components/ui/heading/heading";
import { panel } from "@/components/ui/panel/panel-styles";
import { formatTableValue } from "@/lib/data-reporting-ui";
import type { OverviewResponse } from "@/components/merchandising/use-merchandising-screen";
import type { SalesWorkspaceModel } from "@/lib/merchandising-sales-workspace";
import type { SalesCopy } from "@/lib/sales-copy";
import type { SalesCurrencyBlock, SalesHref } from "../sales-types";
import { SalesMonthlySection } from "../sales-monthly-section/sales-monthly-section";
import { SalesChannelsSection } from "../sales-channels-section/sales-channels-section";
import { SalesCategoryChart } from "../sales-category-chart/sales-category-chart";
import { SalesComparisonSection } from "../sales-comparison-section/sales-comparison-section";

export function SalesCurrencySection({ block, summary, model, showOthers, copy, locale, href }: {
  block: SalesCurrencyBlock;
  summary?: NonNullable<OverviewResponse["sales"]>["summary"][number];
  model: Pick<SalesWorkspaceModel, "groupBy" | "metric" | "measure" | "tablePeriod" | "period" | "history" | "oneOffAvailable">;
  showOthers: boolean;
  copy: SalesCopy;
  locale: string;
  href: SalesHref;
}) {
  const group = model.groupBy;
  const units = model.measure === "units";
  const scopedHref: SalesHref = values =>
    href({ currency: block.currency ?? "__unassigned__", ...values });

  return (
    <section
      aria-label={block.currency ?? copy.unassigned}
      className="space-y-5"
    >
      <div className="flex flex-wrap justify-between gap-3 items-baseline border-b border-(--border) pb-3">
        <Heading as="h2" variant="page" className="text-lg tracking-normal text-inherit">
          {block.currency ?? copy.unassigned}
        </Heading>
        {summary ? (
          <p className="text-xs text-(--muted)">
            {copy.orders}:{" "}
            <strong className="text-(--text)">
              {formatTableValue(
                summary.current.orderCount,
                "number",
                locale,
              )}
            </strong>{" "}
            · {copy.qty}:{" "}
            <strong className="text-(--text)">
              {formatTableValue(
                model.history.current ? summary.current.units : null,
                "quantity",
                locale,
              )}
            </strong>
          </p>
        ) : null}
      </div>
      <SalesMonthlySection
        matrix={block.matrix}
        group={group}
        metric={model.metric}
        tablePeriod={model.tablePeriod}
        showOthers={showOthers}
        copy={copy}
        locale={locale}
        href={scopedHref}
      />
      <div className="grid gap-5 xl:grid-cols-2">
        <SalesChannelsSection channels={block.channels} copy={copy} locale={locale} href={scopedHref} />
        <section className={panel}>
          <Heading as="h3" variant="compact" className="px-5 pt-5 text-base text-inherit">
            S3 · {copy.categories}
          </Heading>
          <SalesCategoryChart
            rows={block.categories}
            locale={locale}
            copy={copy}
            units={units}
            href={scopedHref}
          />
        </section>
      </div>
      <SalesComparisonSection
        comparison={block.comparison}
        period={model.period}
        history={model.history}
        oneOffAvailable={model.oneOffAvailable}
        group={group}
        units={units}
        copy={copy}
        locale={locale}
        href={scopedHref}
      />
    </section>
  );
}
