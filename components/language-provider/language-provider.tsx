"use client";

import { useLocale, useMessages } from "next-intl";
import type { Translations } from "@/lib/translations";

export function useLang() {
  const lang = useLocale();
  const t = useMessages() as Translations;
  return { lang, t };
}
