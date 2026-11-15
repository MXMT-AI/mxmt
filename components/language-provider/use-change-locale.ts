"use client";

import { useLocale } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";

export function useChangeLocale() {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  function changeLocale(nextLocale: Locale) {
    if (nextLocale === locale) return;

    router.replace(`${pathname}${window.location.search}${window.location.hash}`, {
      locale: nextLocale,
      scroll: false,
    });
  }

  return { locale, changeLocale };
}
