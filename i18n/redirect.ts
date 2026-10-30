import { isLocale, localeFromPath, localizeHref, routing, type Locale } from "./routing";

export function safeReturnPath(value: string | null, locale: Locale): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(value)) {
    return `/${locale}/dashboard`;
  }
  try {
    const url = new URL(value, "https://mxmt.invalid");
    if (url.origin !== "https://mxmt.invalid" || /^\/(?:api|_next)(?:\/|$)/.test(url.pathname)) return `/${locale}/dashboard`;
    const localized = localizeHref(url.pathname + url.search + url.hash, locale);
    const path = new URL(localized, url.origin).pathname;
    if (/^\/(uk|en)\/(?:api|_next)(?:\/|$)/.test(path) || /^\/(uk|en)\/(login|register)\/?$/.test(path)) return `/${locale}/dashboard`;
    return localized;
  } catch {
    return `/${locale}/dashboard`;
  }
}

export function returnLocale(value: string | null, cookie?: string): Locale {
  return localeFromPath(value ?? "") ?? (isLocale(cookie) ? cookie : routing.defaultLocale);
}
