import type { Lang } from "@/lib/translations";
import type { QualityStockGroup } from "../data-quality-summary/data-quality-summary";

export function DataQualityStockFigures({ stock, lang }: { stock: QualityStockGroup; lang: Lang }) {
  const uk = lang === "uk";
  const formatter = new Intl.NumberFormat(uk ? "uk-UA" : "en-GB", { maximumFractionDigits: 2 });
  const number = (value: string | number | null) => value === null ? "—" : formatter.format(Number(value));

  return (
    <>
      <span className="tabular-nums">
        {number(stock.skuCount)} SKU · {number(stock.quantity)} {uk ? "шт" : "units"} ·{" "}
        {number(stock.costValue)}{" "}
        {stock.currency ?? (uk ? "валюта невідома" : "currency unknown")}
      </span>
      {stock.unknownValueCount > 0 && (
        <span className="block text-xs text-(--muted)">
          {uk ? "Відома частина вартості; SKU без оцінки" : "Known value only; unvalued SKUs"}
          : {number(stock.unknownValueCount)}
        </span>
      )}
      {stock.unknownQuantityCount > 0 && (
        <span className="block text-xs">
          {uk ? "Кількість невідома" : "Unknown quantity"}: {number(stock.unknownQuantityCount)}
        </span>
      )}
    </>
  );
}
