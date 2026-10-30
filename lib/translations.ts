import uk from "@/messages/uk.json";
import en from "@/messages/en.json";
import type { Locale } from "@/i18n/routing";

export type Lang = Locale;
export type TKey = keyof typeof uk;
export type Translations = Record<TKey, string>;
const translations = { uk, en } satisfies Record<Lang, Translations>;
export function getT(lang: Lang): Translations {
  return translations[lang];
}
export default translations;
