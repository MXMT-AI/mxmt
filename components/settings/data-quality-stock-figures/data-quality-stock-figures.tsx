import type { Lang } from "@/lib/translations";
import type { QualityStockGroup } from "../data-quality-summary/data-quality-summary";
import { settingsDataQualityStockFiguresMessages as englishCopy } from "@/messages/en.json";
import { settingsDataQualityStockFiguresMessages as ukrainianCopy } from "@/messages/uk.json";

export function DataQualityStockFigures({ stock, lang }: { stock: QualityStockGroup; lang: Lang }) {
  const uk = lang === "uk";
  const formatter = new Intl.NumberFormat(uk ? "uk-UA" : "en-GB", { maximumFractionDigits: 2 });
  const number = (value: string | number | null) => value === null ? "—" : formatter.format(Number(value));

  return (
    <>
      <span className="tabular-nums">
        {number(stock.skuCount)}{englishCopy.sKU}{number(stock.quantity)} {uk ? ukrainianCopy.units : englishCopy.units} ·{" "}
        {number(stock.costValue)}{" "}
        {stock.currency ?? (uk ? ukrainianCopy.currencyUnknown : englishCopy.currencyUnknown)}
      </span>
      {stock.unknownValueCount > 0 && (
        <span className="block text-xs text-(--muted)">
          {uk ? ukrainianCopy.knownValueOnlyUnvaluedSKUs : englishCopy.knownValueOnlyUnvaluedSKUs}
          : {number(stock.unknownValueCount)}
        </span>
      )}
      {stock.unknownQuantityCount > 0 && (
        <span className="block text-xs">
          {uk ? ukrainianCopy.unknownQuantity : englishCopy.unknownQuantity}: {number(stock.unknownQuantityCount)}
        </span>
      )}
    </>
  );
}
