import { panel } from "@/components/ui/panel/panel-styles";
import { createTableValueFormatter } from "@/lib/data-reporting-ui";
import { cn } from "@/lib/utils";
import { salesReportReason } from "../sales-reporting-workspace/sales-report-copy";
import type { SalesReportData } from "../sales-reporting-workspace/sales-report-types";

type SalesDetailsData = Pick<SalesReportData, "components" | "preorders" | "oneOffOrderCount" | "oneOffOrders" | "issues">;

export function SalesReportDetails({ data, uk }: { data: SalesDetailsData; uk: boolean }) {
  const formatValue = createTableValueFormatter(uk ? "uk-UA" : "en-GB");
  const componentLabels: Partial<Record<string, string>> = {
    MERCHANDISE: uk ? "Товари" : "Merchandise",
    SERVICE: uk ? "Послуги" : "Services",
    GIFT_CARD: "Gift card",
    UNKNOWN: uk ? "Невідомий тип" : "Unknown type",
  };
  const preorderLabel = uk
    ? "Оплачені передзамовлення, окремо від продажів"
    : "Paid preorders, separate from sales";
  const amounts = [
    ...data.components.flatMap(({ id, currency, current }) => current.lineCount ? [{
      key: JSON.stringify(["component", id, currency]),
      label: componentLabels[id],
      currency,
      value: current.revenue,
    }] : []),
    ...data.preorders.flatMap(({ currency, paidAmount, lineCount }) => lineCount ? [{
      key: JSON.stringify(["preorder", currency]),
      label: preorderLabel,
      currency,
      value: paidAmount,
    }] : []),
  ];

  return (
    <details className={cn(panel, "bg-transparent p-4 text-sm text-(--muted)")}>
      <summary className="cursor-pointer focus-visible:outline-solid">
        {uk
          ? "Компоненти, передзамовлення й винятки"
          : "Components, preorders and exceptions"}
      </summary>
      <div className="mt-3 space-y-3">
        <p>
          {uk
            ? "Послуги входять у виручку, але їх прибуток не підтверджений. Gift card та невідомі типи показано окремо."
            : "Services enter revenue with unverified profit. Gift cards and unknown product types remain separate."}
        </p>
        {amounts.map(({ key, label, currency, value }) => (
          <p key={key}>{label} · {currency ?? "—"}: {formatValue(value, "money")}</p>
        ))}
        <p>
          {uk
            ? "Разових замовлень LY понад 50% місячної виручки бренду:"
            : "LY orders exceeding 50% of monthly brand revenue:"}{" "}
          {data.oneOffOrderCount}
        </p>
        {data.oneOffOrders.map((o) => (
          <p key={JSON.stringify([o.period, o.month, o.sourceId, o.orderId, o.brandId, o.currency])}>
            {o.period === "ly"
              ? "LY"
              : uk
                ? "Поточний період"
                : "Current"}{" "}
            · {o.month} · {o.orderId} · {o.currency ?? "—"} ·{" "}
            {formatValue(o.revenue, "money")} · {formatValue(o.shareOfLy, "percentage")} LY
          </p>
        ))}
        {data.issues.map((issue) => (
          <p key={issue.code}>
            {salesReportReason(issue.code, uk)}: {issue.count}
          </p>
        ))}
      </div>
    </details>
  );
}
