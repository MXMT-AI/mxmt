"use client";

import { useLocale, useMessages } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import type { Lang, Translations } from "@/lib/translations";

export function useLang() {
  const lang = useLocale();
  const t = useMessages() as Translations;
  return { lang, t };
}

export function LangToggle({ className = "" }: { className?: string }) {
  const { lang } = useLang();
  const pathname = usePathname();
  const router = useRouter();
  function setLang(locale: Lang) {
    if (locale === lang) return;
    router.replace(`${pathname}${window.location.search}${window.location.hash}`, { locale, scroll: false });
  }
  return (
    <button
      type="button"
      onClick={() => setLang(lang === "uk" ? "en" : "uk")}
      aria-label={lang === "uk" ? "Switch to English" : "Перемкнути на українську"}
      className={`flex items-center gap-1.5 px-2 py-1 rounded-lg bg-(--input-bg) border border-(--border) hover:bg-(--input-hover) transition-colors text-xs font-mono text-(--muted) hover:text-(--text) ${className}`}
      title={lang === "uk" ? "Switch to English" : "Перемкнути на українську"}
    >
      {lang === "uk" ? "🇺🇦 UA" : "🇬🇧 EN"}
    </button>
  );
}
