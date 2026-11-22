import type { Lang } from "@/lib/translations";
import { settingsDataQualityCardDataQualityLabelsMessages as englishCopy } from "@/messages/en.json";
import { settingsDataQualityCardDataQualityLabelsMessages as ukrainianCopy } from "@/messages/uk.json";

const kindLabels = {
  UNKNOWN: { uk: ukrainianCopy.enUnverified, en: englishCopy.enUnverified },
  MERCHANDISE: { uk: ukrainianCopy.enMerchandise, en: englishCopy.enMerchandise },
  SERVICE: { uk: ukrainianCopy.enService, en: englishCopy.enService },
  GIFT_CARD: { uk: ukrainianCopy.enGiftCard, en: englishCopy.enGiftCard },
};

export function productKindLabel(kind: string, lang: Lang) {
  return Object.hasOwn(kindLabels, kind) ? kindLabels[kind as keyof typeof kindLabels][lang] : kind;
}

export function qualityAmountLabel(amount: string | null, currency: string | null, lang: Lang) {
  if (amount === null) return lang === "uk" ? ukrainianCopy.unavailable : englishCopy.unavailable;
  const value = Number(amount).toLocaleString(lang === "uk" ? "uk-UA" : "en-GB", { maximumFractionDigits: 2 });
  return `${value} ${currency ?? (lang === "uk" ? ukrainianCopy.currencyUnknown : englishCopy.currencyUnknown)}`;
}
