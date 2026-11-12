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
const protectedPages = new Set([
  "/agents", "/analyst", "/assortment", "/calendar", "/dashboard", "/data-reporting",
  "/overview", "/reordering", "/repricing", "/sales", "/settings", "/stock",
]);

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const api = matchesPath(pathname, "/api");
  const pathLocale = localeFromPath(pathname);
  const savedLocale = request.cookies.get("lang")?.value;
  const locale = pathLocale ?? (isLocale(savedLocale) ? savedLocale : routing.defaultLocale);
  const pagePath = pathLocale ? pathname.slice(pathLocale.length + 1) || "/" : pathname;

  if (/^\/training-data\/(products|stock|orders)\.csv$/.test(pathname)) return NextResponse.next();

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
    if (pagePath === "/" || pagePath === "/docs" || pagePath === "/login" || pagePath === "/register") return intlMiddleware(request);
  }

  const loginUrl = new URL(`/${locale}/login`, request.url);
  loginUrl.searchParams.set("next", pathname + request.nextUrl.search);
  const protectedPage = protectedPages.has(pagePath.replace(/\/$/, ""));
  const requestHeaders = new Headers(request.headers);
  for (const header of ["x-user-id", "x-tenant-id", "x-user-role"]) requestHeaders.delete(header);
  const anonymousPage = () => {
    // Let the router resolve unknown URLs to 404 without trusting client-supplied identity.
    if (!protectedPage) {
      return intlMiddleware(new NextRequest(request, { headers: requestHeaders }));
    }
    return NextResponse.redirect(loginUrl);
  };
  const token = request.cookies.get("access_token")?.value;
  if (!token) {
    return api
      ? NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      : anonymousPage();
  }

  try {
    const { payload } = await jwtVerify(token, ACCESS_SECRET);
    requestHeaders.set("x-user-id", payload.sub as string);
    requestHeaders.set("x-tenant-id", (payload as Record<string, string>).tenantId);
    requestHeaders.set("x-user-role", (payload as Record<string, string>).role);
    if (api) return NextResponse.next({ request: { headers: requestHeaders } });
    return intlMiddleware(new NextRequest(request, { headers: requestHeaders }));
  } catch (err) {
    if (err instanceof errors.JWTExpired && !api && protectedPage && request.cookies.has("refresh_token")) {
      const refreshUrl = new URL("/api/auth/silent-refresh", request.url);
      refreshUrl.searchParams.set("next", pathname + request.nextUrl.search);
      return NextResponse.redirect(refreshUrl);
    }
    if (api) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const response = anonymousPage();
    response.cookies.delete("access_token");
    return response;
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt|sitemap.xml).*)"],
};
