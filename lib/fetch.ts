import { localeFromPath, localizeHref, routing } from "@/i18n/routing";
import { refreshAccessToken } from "./client/refresh-access-token";

export async function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const res = await fetch(input, init);

  if (res.status !== 401) return res;

  const refreshed = await refreshAccessToken();
  if (refreshed) return fetch(input, init);
  if (typeof window !== "undefined") {
    const { pathname, search, hash } = window.location;
    const locale = localeFromPath(pathname) ?? routing.defaultLocale;
    const query = new URLSearchParams({ next: pathname + search + hash });
    window.location.href = localizeHref(`/login?${query}`, locale);
  }
  return res;
}
