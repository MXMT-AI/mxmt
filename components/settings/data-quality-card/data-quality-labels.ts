import type { Lang } from "@/lib/translations";

const kindLabels = {
  UNKNOWN: { uk: "Не підтверджено", en: "Unverified" },
  MERCHANDISE: { uk: "Товар", en: "Merchandise" },
  SERVICE: { uk: "Послуга", en: "Service" },
  GIFT_CARD: { uk: "Сертифікат", en: "Gift card" },
};

export function productKindLabel(kind: string, lang: Lang) {
  return Object.hasOwn(kindLabels, kind) ? kindLabels[kind as keyof typeof kindLabels][lang] : kind;
}

export function qualityAmountLabel(amount: string | null, currency: string | null, lang: Lang) {
  if (amount === null) return lang === "uk" ? "Немає даних" : "Unavailable";
  const value = Number(amount).toLocaleString(lang === "uk" ? "uk-UA" : "en-GB", { maximumFractionDigits: 2 });
  return `${value} ${currency ?? (lang === "uk" ? "валюта невідома" : "currency unknown")}`;
}
