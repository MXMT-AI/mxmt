import { Link } from "@/i18n/navigation";
import { Heading } from "@/components/ui/heading/heading";
import { MetricTile } from "@/components/ui/metric-tile/metric-tile";
import { panel } from "@/components/ui/panel/panel-styles";
import { createTableValueFormatter } from "@/lib/data-reporting-ui";
import type { SalesReportData } from "../sales-reporting-workspace/sales-report-types";
import { dataReportingSalesCurrencySummaryMessages as englishCopy } from "@/messages/en.json";
import { dataReportingSalesCurrencySummaryMessages as ukrainianCopy } from "@/messages/uk.json";

export function SalesCurrencySummary({ row, uk }: {
  row: SalesReportData["summary"][number];
  uk: boolean;
}) {
  const formatValue = createTableValueFormatter(uk ? "uk-UA" : "en-GB");
  const currencyLabel = row.currency ?? (uk ? ukrainianCopy.currencyLabelUnknownCurrency : englishCopy.currencyLabelUnknownCurrency);
  const { current, plan } = row;
  const metrics: [label: string, value: string | number | null, type?: "money" | "number" | "quantity" | "percentage"][] = [
    [uk ? ukrainianCopy.metricsNetRevenue : englishCopy.metricsNetRevenue, current.revenue],
    [uk ? ukrainianCopy.metricsSaleOrders : englishCopy.metricsSaleOrders, current.orderCount, "number"],
    [uk ? ukrainianCopy.metricsReturnOrders : englishCopy.metricsReturnOrders, current.returnOrderCount, "number"],
    [uk ? ukrainianCopy.metricsMerchandiseUnits : englishCopy.metricsMerchandiseUnits, current.units, "quantity"],
    [uk ? ukrainianCopy.metricsCoveredGrossProfit : englishCopy.metricsCoveredGrossProfit, current.coveredGrossProfit],
    [uk ? ukrainianCopy.metricsCoveredGM : englishCopy.metricsCoveredGM, current.gmPct, "percentage"],
    [uk ? ukrainianCopy.metricsCoveredRevenue : englishCopy.metricsCoveredRevenue, current.coveredRevenue],
    [uk ? ukrainianCopy.metricsMonthlyPlanAttainment : englishCopy.metricsMonthlyPlanAttainment, plan.attainmentPct, "percentage"],
    [uk ? ukrainianCopy.metricsPaceAgainstPeriodDayTarget : englishCopy.metricsPaceAgainstPeriodDayTarget, plan.pacePct, "percentage"],
  ];

  return (
    <section className={panel + " p-4"} aria-label={currencyLabel}>
      <Heading as="h2" variant="compact" className="text-base">
        {currencyLabel}
      </Heading>
      <dl className="mt-3 grid grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
        {metrics.map(([label, value, type = "money"]) => (
          <MetricTile key={label} label={label} value={formatValue(value, type)} variant="report" />
        ))}
      </dl>
      {row.coveredMarginBelowTarget !== null && (
        <p className="mt-3 text-sm text-(--text)">
          {uk ? ukrainianCopy.coveredMargin : englishCopy.coveredMargin}:{" "}
          {row.coveredMarginBelowTarget
            ? uk
              ? ukrainianCopy.belowTarget
              : englishCopy.belowTarget
            : uk
              ? ukrainianCopy.atOrAboveTarget
              : englishCopy.atOrAboveTarget}{" "}
          {formatValue(row.marginTargetPct, "percentage")}.
        </p>
      )}
      {["PLAN_UNSET", "PLAN_CURRENCY_UNAVAILABLE"].includes(
        plan.reason ?? "",
      ) && (
        <Link
          className="mt-3 block text-sm text-(--text) underline focus-visible:outline-solid"
          href="/settings?tab=merchandising"
        >
          {uk ? ukrainianCopy.setPlanAndCurrency : englishCopy.setPlanAndCurrency}
        </Link>
      )}
      {current.coverage !== "COMPLETE" && (
        <p className="mt-3 text-sm text-(--text) font-medium">
          {uk
            ? ukrainianCopy.partialDataLinesWithoutKnown
            : englishCopy.partialDataLinesWithoutKnown}{" "}
          {current.missingProfitCount};{" "}
          {uk ? ukrainianCopy.withoutKnownRevenue : englishCopy.withoutKnownRevenue}{" "}
          {current.missingRevenueCount}.
        </p>
      )}
    </section>
  );
}
