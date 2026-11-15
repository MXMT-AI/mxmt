import { formatTableValue } from "@/lib/data-reporting-ui";
import { salesReportReason } from "../sales-reporting-workspace/sales-report-copy";
import type { SalesReportData } from "../sales-reporting-workspace/sales-report-types";

export function SalesReportDetails({ data, uk }: { data: SalesReportData; uk: boolean }) {
  const text = (code: string) => salesReportReason(code, uk);
  const fmt = (value: unknown, type: "money" | "percentage" = "money") =>
    formatTableValue(value, type, uk ? "uk-UA" : "en-GB");
  return (
    <details className="rounded-xl border border-(--border) p-4 text-sm text-(--muted)">
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
        {data.components
          .filter((c) => c.current.lineCount)
          .map((c) => (
            <p key={`${c.id}:${c.currency}`}>
              {
                (
                  {
                    MERCHANDISE: uk ? "Товари" : "Merchandise",
                    SERVICE: uk ? "Послуги" : "Services",
                    GIFT_CARD: "Gift card",
                    UNKNOWN: uk ? "Невідомий тип" : "Unknown type",
                  } as Record<string, string>
                )[c.id]
              }{" "}
              · {c.currency ?? "—"}: {fmt(c.current.revenue)}
            </p>
          ))}
        {data.preorders
          .filter((p) => p.lineCount)
          .map((p) => (
            <p key={p.currency ?? "unknown"}>
              {uk
                ? "Оплачені передзамовлення, окремо від продажів"
                : "Paid preorders, separate from sales"}{" "}
              · {p.currency ?? "—"}: {fmt(p.paidAmount)}
            </p>
          ))}
        <p>
          {uk
            ? "Разових замовлень LY понад 50% місячної виручки бренду:"
            : "LY orders exceeding 50% of monthly brand revenue:"}{" "}
          {data.oneOffOrderCount}
        </p>
        {data.oneOffOrders.map((o, i) => (
          <p key={i}>
            {o.period === "ly"
              ? "LY"
              : uk
                ? "Поточний період"
                : "Current"}{" "}
            · {o.month} · {o.orderId} · {o.currency ?? "—"} ·{" "}
            {fmt(o.revenue)} · {fmt(o.shareOfLy, "percentage")} LY
          </p>
        ))}
        {data.issues.map((issue) => (
          <p key={issue.code}>
            {text(issue.code)}: {issue.count}
          </p>
        ))}
      </div>
    </details>
  );
}
