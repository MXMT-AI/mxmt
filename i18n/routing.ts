import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["uk", "en"],
  defaultLocale: "uk",
  localePrefix: "always",
  // Unprefixed links use the saved preference, then Ukrainian (not browser language).
  localeDetection: false,
  localeCookie: { name: "lang", maxAge: 31536000, sameSite: "lax" },
});

export type Locale = (typeof routing.locales)[number];
export function isLocale(value: unknown): value is Locale {
  return value === "uk" || value === "en";
}

export function localeFromPath(pathname: string): Locale | undefined {
  const segment = pathname.split("/")[1];
  return isLocale(segment) ? segment : undefined;
}

/** Localize only application pages; API, files, fragments and external URLs stay intact. */
export function localizeHref(href: string, locale: Locale): string {
  if (!href.startsWith("/") || href.startsWith("//") || /^\/(?:api|_next)(?:\/|$)/.test(href)) return href;
  const current = localeFromPath(href.split(/[?#]/)[0]);
  const path = current ? href.slice(current.length + 1) : href;
  return `/${locale}${path === "/" ? "" : path}`;
}
