"use client";
import { Link } from "@/i18n/navigation";
import {
  qualityLabel,
  qualityGuidance,
  qualityFixHref,
} from "@/lib/data-quality-copy";
import { button } from "@/components/merchandising/ReportPrimitives";
export interface QualityStockGroup {
  currency: string | null;
  skuCount: number;
  quantity: string | null;
  costValue: string | null;
  unknownValueCount: number;
  unknownQuantityCount: number;
}
export default function DataQualitySummary({
  summary,
  affectedStock,
  lang,
  selected,
  onSelect,
}: {
  summary: (QualityStockGroup & { code: string })[];
  affectedStock: QualityStockGroup[];
  lang: "uk" | "en";
  selected: string;
  onSelect: (code: string) => void;
}) {
  const uk = lang === "uk",
    locale = uk ? "uk-UA" : "en-GB",
    n = (v: string | number | null) =>
      v === null
        ? "—"
        : new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(
            Number(v),
          );
  const figures = (s: QualityStockGroup) => (
    <>
      <span className="tabular-nums">
        {n(s.skuCount)} SKU · {n(s.quantity)} {uk ? "шт" : "units"} ·{" "}
        {n(s.costValue)}{" "}
        {s.currency ?? (uk ? "валюта невідома" : "currency unknown")}
      </span>
      {s.unknownValueCount > 0 && (
        <span className="block text-xs text-(--muted)">
          {uk
            ? "Відома частина вартості; SKU без оцінки"
            : "Known value only; unvalued SKUs"}
          : {n(s.unknownValueCount)}
        </span>
      )}
      {s.unknownQuantityCount > 0 && (
        <span className="block text-xs">
          {uk ? "Кількість невідома" : "Unknown quantity"}:{" "}
          {n(s.unknownQuantityCount)}
        </span>
      )}
    </>
  );
  return (
    <div className="mt-5 space-y-4">
      <div className="border-y border-(--border) py-4 space-y-2">
        <h3 className="font-semibold">
          {uk ? "Товарний залишок з проблемами" : "Affected merchandise stock"}
        </h3>
        <p className="text-sm text-(--muted)">
          {uk
            ? "Кожен SKU враховано один раз. Групи нижче перетинаються — їх не можна додавати. Вартість наведено за собівартістю, окремо для кожної валюти."
            : "Each SKU is counted once. The groups below overlap and must not be added together. Stock is valued at cost, separately for each currency."}
        </p>
        {affectedStock.map((s) => (
          <p key={s.currency ?? "unknown"} className="text-sm">
            {figures(s)}
          </p>
        ))}
        {!affectedStock.length && (
          <p className="text-sm">
            {uk
              ? "Підтвердженого товарного залишку з оцінкою проблем немає. Перевірте типи позицій і наявність датованих залишків у групах нижче."
              : "No verified merchandise stock is available for an affected-stock total. Check product types and dated stock observations in the groups below."}
          </p>
        )}
      </div>
      <button
        className={button}
        type="button"
        aria-pressed={!selected}
        onClick={() => onSelect("")}
      >
        {uk ? "Усі товари" : "All products"}
      </button>
      <ul className="divide-y divide-(--border)">
        {summary.map((s) => (
          <li key={s.code + ":" + s.currency} className="py-3 space-y-2">
            <button
              className="text-left text-sm font-semibold underline underline-offset-4 min-h-11 focus-visible:outline-solid"
              type="button"
              aria-pressed={selected === s.code}
              onClick={() => onSelect(s.code)}
            >
              {qualityLabel(s.code, lang)}
            </button>
            <p className="text-sm">{figures(s)}</p>
            <p className="text-sm text-(--muted) max-w-prose">
              {qualityGuidance(s.code, lang)}
            </p>
            <Link
              className="inline-flex min-h-11 items-center text-sm underline underline-offset-4 focus-visible:outline-solid"
              href={qualityFixHref(s.code)}
            >
              {uk ? "Де виправити" : "Where to fix"}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
