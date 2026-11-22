import uk from "@/messages/uk.json";
import en from "@/messages/en.json";
import type { Locale } from "@/i18n/routing";
import { getInterfaceMessages, type InterfaceKey, type InterfaceMessages } from "@/i18n/interface-messages";

export type Lang = Locale;
export type TKey = InterfaceKey;
export type Translations = InterfaceMessages;
const translations = {
  uk: getInterfaceMessages(uk),
  en: getInterfaceMessages(en),
} satisfies Record<Lang, Translations>;
export function getT(lang: Lang): Translations {
  return translations[lang];
}
export default translations;
