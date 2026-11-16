"use client";
import { Link } from "@/i18n/navigation";
import {
  qualityLabel,
  qualityGuidance,
  qualityFixHref,
} from "@/lib/data-quality-copy";
import { Button } from "@/components/ui/button/button";
import { Heading } from "@/components/ui/heading/heading";
import { Text } from "@/components/ui/text/text";
import { DataQualityStockFigures } from "../data-quality-stock-figures/data-quality-stock-figures";
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
  const uk = lang === "uk";
  return (
    <div className="mt-5 space-y-4">
      <div className="border-y border-(--border) py-4 space-y-2">
        <Heading as="h3" variant="compact" className="text-base text-inherit">
          {uk ? "Товарний залишок з проблемами" : "Affected merchandise stock"}
        </Heading>
        <Text variant="body" className="leading-normal text-(--muted)">
          {uk
            ? "Кожен SKU враховано один раз. Групи нижче перетинаються — їх не можна додавати. Вартість наведено за собівартістю, окремо для кожної валюти."
            : "Each SKU is counted once. The groups below overlap and must not be added together. Stock is valued at cost, separately for each currency."}
        </Text>
        {affectedStock.map((s) => (
          <Text variant="body" key={s.currency ?? "unknown"} className="leading-normal text-inherit">
            <DataQualityStockFigures stock={s} lang={lang} />
          </Text>
        ))}
        {!affectedStock.length && (
          <Text variant="body" className="leading-normal text-inherit">
            {uk
              ? "Підтвердженого товарного залишку з оцінкою проблем немає. Перевірте типи позицій і наявність датованих залишків у групах нижче."
              : "No verified merchandise stock is available for an affected-stock total. Check product types and dated stock observations in the groups below."}
          </Text>
        )}
      </div>
      <Button
        variant="report"
        aria-pressed={!selected}
        onClick={() => onSelect("")}
      >
        {uk ? "Усі товари" : "All products"}
      </Button>
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
            <Text variant="body" className="leading-normal text-inherit">
              <DataQualityStockFigures stock={s} lang={lang} />
            </Text>
            <Text variant="body" className="max-w-prose leading-normal text-(--muted)">
              {qualityGuidance(s.code, lang)}
            </Text>
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
