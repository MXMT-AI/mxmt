import { Link } from "@/i18n/navigation";
import { Heading } from "@/components/ui/heading/heading";
import { MetricTile } from "@/components/ui/metric-tile/metric-tile";
import { panel } from "@/components/ui/panel/panel-styles";
import { createTableValueFormatter } from "@/lib/data-reporting-ui";
import type { SalesReportData } from "../sales-reporting-workspace/sales-report-types";

export function SalesCurrencySummary({ row, uk }: {
  row: SalesReportData["summary"][number];
  uk: boolean;
}) {
  const formatValue = createTableValueFormatter(uk ? "uk-UA" : "en-GB");
  const currencyLabel = row.currency ?? (uk ? "Невідома валюта" : "Unknown currency");
  const { current, plan } = row;
  const metrics: [label: string, value: string | number | null, type?: "money" | "number" | "quantity" | "percentage"][] = [
    [uk ? "Чиста виручка" : "Net revenue", current.revenue],
    [uk ? "Замовлення-продажі" : "Sale orders", current.orderCount, "number"],
    [uk ? "Замовлення-повернення" : "Return orders", current.returnOrderCount, "number"],
    [uk ? "Одиниці товару" : "Merchandise units", current.units, "quantity"],
    [uk ? "Валовий прибуток покритих рядків" : "Covered gross profit", current.coveredGrossProfit],
    [uk ? "Маржа покритих рядків" : "Covered GM", current.gmPct, "percentage"],
    [uk ? "Виручка покритих рядків" : "Covered revenue", current.coveredRevenue],
    [uk ? "Виконання місячного плану" : "Monthly plan attainment", plan.attainmentPct, "percentage"],
    [uk ? "Темп проти плану за дні періоду" : "Pace against period-day target", plan.pacePct, "percentage"],
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
          {uk ? "Маржа покритих рядків" : "Covered margin"}:{" "}
          {row.coveredMarginBelowTarget
            ? uk
              ? "нижче порогу"
              : "below target"
            : uk
              ? "не нижче порогу"
              : "at or above target"}{" "}
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
          {uk ? "Задати план і валюту" : "Set plan and currency"}
        </Link>
      )}
      {current.coverage !== "COMPLETE" && (
        <p className="mt-3 text-sm text-(--text) font-medium">
          {uk
            ? "Часткові дані. Рядків без відомого прибутку:"
            : "Partial data. Lines without known profit:"}{" "}
          {current.missingProfitCount};{" "}
          {uk ? "без відомої виручки:" : "without known revenue:"}{" "}
          {current.missingRevenueCount}.
        </p>
      )}
    </section>
  );
}
