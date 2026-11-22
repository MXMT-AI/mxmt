import { panel } from "@/components/ui/panel/panel-styles";
import { createTableValueFormatter } from "@/lib/data-reporting-ui";
import { cn } from "@/lib/utils";
import { salesReportReason } from "../sales-reporting-workspace/sales-report-copy";
import type { SalesReportData } from "../sales-reporting-workspace/sales-report-types";
import { dataReportingSalesReportDetailsMessages as englishCopy } from "@/messages/en.json";
import { dataReportingSalesReportDetailsMessages as ukrainianCopy } from "@/messages/uk.json";

type SalesDetailsData = Pick<SalesReportData, "components" | "preorders" | "oneOffOrderCount" | "oneOffOrders" | "issues">;

export function SalesReportDetails({ data, uk }: { data: SalesDetailsData; uk: boolean }) {
  const formatValue = createTableValueFormatter(uk ? "uk-UA" : "en-GB");
  const componentLabels: Partial<Record<string, string>> = {
    MERCHANDISE: uk ? ukrainianCopy.mERCHANDISE : englishCopy.mERCHANDISE,
    SERVICE: uk ? ukrainianCopy.sERVICE : englishCopy.sERVICE,
    GIFT_CARD: englishCopy.gIFTCARD,
    UNKNOWN: uk ? ukrainianCopy.uNKNOWN : englishCopy.uNKNOWN,
  };
  const preorderLabel = uk
    ? ukrainianCopy.preorderLabelPaidPreordersSeparateFromSales
    : englishCopy.preorderLabelPaidPreordersSeparateFromSales;
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
          ? ukrainianCopy.componentsPreordersAndExceptions
          : englishCopy.componentsPreordersAndExceptions}
      </summary>
      <div className="mt-3 space-y-3">
        <p>
          {uk
            ? ukrainianCopy.servicesEnterRevenueWithUnverified
            : englishCopy.servicesEnterRevenueWithUnverified}
        </p>
        {amounts.map(({ key, label, currency, value }) => (
          <p key={key}>{label} · {currency ?? "—"}: {formatValue(value, "money")}</p>
        ))}
        <p>
          {uk
            ? ukrainianCopy.lYOrdersExceeding50Of
            : englishCopy.lYOrdersExceeding50Of}{" "}
          {data.oneOffOrderCount}
        </p>
        {data.oneOffOrders.map((o) => (
          <p key={JSON.stringify([o.period, o.month, o.sourceId, o.orderId, o.brandId, o.currency])}>
            {o.period === "ly"
              ? englishCopy.lY
              : uk
                ? ukrainianCopy.current
                : englishCopy.current}{" "}
            · {o.month} · {o.orderId} · {o.currency ?? "—"} ·{" "}
            {formatValue(o.revenue, "money")} · {formatValue(o.shareOfLy, "percentage")}{englishCopy.lY2}</p>
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
