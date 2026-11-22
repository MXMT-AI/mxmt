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
import { settingsDataQualitySummaryMessages as englishCopy } from "@/messages/en.json";
import { settingsDataQualitySummaryMessages as ukrainianCopy } from "@/messages/uk.json";
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
          {uk ? ukrainianCopy.affectedMerchandiseStock : englishCopy.affectedMerchandiseStock}
        </Heading>
        <Text variant="body" className="leading-normal text-(--muted)">
          {uk
            ? ukrainianCopy.eachSKUIsCountedOnce
            : englishCopy.eachSKUIsCountedOnce}
        </Text>
        {affectedStock.map((s) => (
          <Text variant="body" key={s.currency ?? "unknown"} className="leading-normal text-inherit">
            <DataQualityStockFigures stock={s} lang={lang} />
          </Text>
        ))}
        {!affectedStock.length && (
          <Text variant="body" className="leading-normal text-inherit">
            {uk
              ? ukrainianCopy.noVerifiedMerchandiseStockIs
              : englishCopy.noVerifiedMerchandiseStockIs}
          </Text>
        )}
      </div>
      <Button
        variant="report"
        aria-pressed={!selected}
        onClick={() => onSelect("")}
      >
        {uk ? ukrainianCopy.allProducts : englishCopy.allProducts}
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
              {uk ? ukrainianCopy.whereToFix : englishCopy.whereToFix}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
