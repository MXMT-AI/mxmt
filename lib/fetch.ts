import { localeFromPath, localizeHref, routing } from "@/i18n/routing";

// Thin fetch wrapper for client-side API calls.
// On 401, attempts one silent token refresh then retries the request.
// If refresh also fails, preserve the locale and page when returning to login.

async function tryRefresh(): Promise<boolean> {
  try {
    const res = await fetch("/api/auth/refresh", { method: "POST" });
    return res.ok;
  } catch {
    return false;
  }
}

export async function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const res = await fetch(input, init);

  if (res.status !== 401) return res;

  const refreshed = await tryRefresh();
  if (!refreshed) {
    const { pathname, search, hash } = window.location;
    const locale = localeFromPath(pathname) ?? routing.defaultLocale;
    const query = new URLSearchParams({ next: pathname + search + hash });
    window.location.href = localizeHref(`/login?${query}`, locale);
    return res;
  }

  // Retry original request with refreshed token (cookies updated server-side)
  return fetch(input, init);
}
