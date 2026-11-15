import { Link } from "@/i18n/navigation";
import { Heading } from "@/components/ui/heading/heading";
import { MetricTile } from "@/components/ui/metric-tile/metric-tile";
import { formatTableValue } from "@/lib/data-reporting-ui";
import type { SalesReportData } from "../sales-reporting-workspace/sales-report-types";

export function SalesCurrencySummary({ row, uk }: {
  row: SalesReportData["summary"][number];
  uk: boolean;
}) {
  const fmt = (value: unknown, type: "money" | "percentage" | "quantity" | "number" = "money") =>
    formatTableValue(value, type, uk ? "uk-UA" : "en-GB");
  return (
    <section
      className="rounded-xl border border-(--border) bg-(--surface) p-4"
      aria-label={
        row.currency ?? (uk ? "Невідома валюта" : "Unknown currency")
      }
    >
      <Heading as="h2" variant="compact" className="text-base">
        {row.currency ??
          (uk ? "Невідома валюта" : "Unknown currency")}
      </Heading>
      <dl className="mt-3 grid grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
        {[
          [
            uk ? "Чиста виручка" : "Net revenue",
            fmt(row.current.revenue),
          ],
          [
            uk ? "Замовлення-продажі" : "Sale orders",
            fmt(row.current.orderCount, "number"),
          ],
          [
            uk ? "Замовлення-повернення" : "Return orders",
            fmt(row.current.returnOrderCount, "number"),
          ],
          [
            uk ? "Одиниці товару" : "Merchandise units",
            fmt(row.current.units, "quantity"),
          ],
          [
            uk
              ? "Валовий прибуток покритих рядків"
              : "Covered gross profit",
            fmt(row.current.coveredGrossProfit),
          ],
          [
            uk ? "Маржа покритих рядків" : "Covered GM",
            fmt(row.current.gmPct, "percentage"),
          ],
          [
            uk ? "Виручка покритих рядків" : "Covered revenue",
            fmt(row.current.coveredRevenue),
          ],
          [
            uk
              ? "Виконання місячного плану"
              : "Monthly plan attainment",
            fmt(row.plan.attainmentPct, "percentage"),
          ],
          [
            uk
              ? "Темп проти плану за дні періоду"
              : "Pace against period-day target",
            fmt(row.plan.pacePct, "percentage"),
          ],
        ].map(([label, value]) => (
          <MetricTile key={label} label={label} value={value} variant="report" />
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
          {fmt(row.marginTargetPct, "percentage")}.
        </p>
      )}
      {["PLAN_UNSET", "PLAN_CURRENCY_UNAVAILABLE"].includes(
        row.plan.reason ?? "",
      ) && (
        <Link
          className="mt-3 block text-sm text-(--text) underline focus-visible:outline-solid"
          href="/settings?tab=merchandising"
        >
          {uk ? "Задати план і валюту" : "Set plan and currency"}
        </Link>
      )}
      {row.current.coverage !== "COMPLETE" && (
        <p className="mt-3 text-sm text-(--text) font-medium">
          {uk
            ? "Часткові дані. Рядків без відомого прибутку:"
            : "Partial data. Lines without known profit:"}{" "}
          {row.current.missingProfitCount};{" "}
          {uk ? "без відомої виручки:" : "without known revenue:"}{" "}
          {row.current.missingRevenueCount}.
        </p>
      )}
    </section>
  );
}
