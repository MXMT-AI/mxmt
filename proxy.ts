import { NextRequest, NextResponse } from "next/server";
import { jwtVerify, errors } from "jose";
import createMiddleware from "next-intl/middleware";
import { isLocale, localeFromPath, localizeHref, routing } from "@/i18n/routing";

const ACCESS_SECRET = new TextEncoder().encode(
  process.env.JWT_ACCESS_SECRET ?? "dev-access-secret-change-in-production"
);
const handleIntl = createMiddleware(routing);
function intlMiddleware(request: NextRequest) {
  const response = handleIntl(request);
  const locale = localeFromPath(request.nextUrl.pathname);
  const destination = request.headers.get("sec-fetch-dest");
  if (locale && (destination === null || destination === "document")) {
    response.cookies.set("lang", locale, { path: "/", maxAge: 31536000, sameSite: "lax" });
  }
  return response;
}
const matchesPath = (path: string, base: string) => path === base || path.startsWith(`${base}/`);

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const api = matchesPath(pathname, "/api");
  const pathLocale = localeFromPath(pathname);
  const savedLocale = request.cookies.get("lang")?.value;
  const locale = pathLocale ?? (isLocale(savedLocale) ? savedLocale : routing.defaultLocale);
  const pagePath = pathLocale ? pathname.slice(pathLocale.length + 1) || "/" : pathname;

  const publicApi = ["/api/auth", "/api/health", "/api/cron"].some(p => matchesPath(pathname, p));
  const salesDriveReceiver = /^\/api\/webhooks\/salesdrive\/[^/]+\/?$/.test(pathname);
  if (api && (publicApi || salesDriveReceiver)) return NextResponse.next();

  if (!api) {
    if (!pathLocale && /^\/[a-z]{2}(?:-[A-Za-z]{2})?(?:\/|$)/.test(pathname)) return NextResponse.next();
    if (!pathLocale) {
      const url = request.nextUrl.clone();
      url.pathname = localizeHref(pathname, locale);
      return NextResponse.redirect(url);
    }
    if (pagePath === "/login" || pagePath === "/register") return intlMiddleware(request);
  }

  const loginUrl = new URL(`/${locale}/login`, request.url);
  loginUrl.searchParams.set("next", pathname + request.nextUrl.search);
  const token = request.cookies.get("access_token")?.value;
  if (!token) {
    return api
      ? NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      : NextResponse.redirect(loginUrl);
  }

  try {
    const { payload } = await jwtVerify(token, ACCESS_SECRET);
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-user-id", payload.sub as string);
    requestHeaders.set("x-tenant-id", (payload as Record<string, string>).tenantId);
    requestHeaders.set("x-user-role", (payload as Record<string, string>).role);
    if (api) return NextResponse.next({ request: { headers: requestHeaders } });
    return intlMiddleware(new NextRequest(request, { headers: requestHeaders }));
  } catch (err) {
    if (err instanceof errors.JWTExpired && !api && request.cookies.has("refresh_token")) {
      const refreshUrl = new URL("/api/auth/silent-refresh", request.url);
      refreshUrl.searchParams.set("next", pathname + request.nextUrl.search);
      return NextResponse.redirect(refreshUrl);
    }
    if (api) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const response = NextResponse.redirect(loginUrl);
    response.cookies.delete("access_token");
    return response;
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt|sitemap.xml).*)"],
};
