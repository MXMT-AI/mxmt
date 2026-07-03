import { NextRequest, NextResponse } from "next/server";
import { jwtVerify, errors } from "jose";

const ACCESS_SECRET = new TextEncoder().encode(
  process.env.JWT_ACCESS_SECRET ?? "dev-access-secret-change-in-production"
);

const PUBLIC_PATHS = ["/login", "/register", "/api/auth"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const token = request.cookies.get("access_token")?.value;

  if (!token) {
    return pathname.startsWith("/api/")
      ? NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      : NextResponse.redirect(new URL("/login", request.url));
  }

  try {
    const { payload } = await jwtVerify(token, ACCESS_SECRET);

    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-user-id", payload.sub as string);
    requestHeaders.set("x-tenant-id", (payload as Record<string, string>).tenantId);
    requestHeaders.set("x-user-role", (payload as Record<string, string>).role);

    return NextResponse.next({ request: { headers: requestHeaders } });
  } catch (err) {
    // Expired token + refresh cookie present → try silent refresh (page routes only)
    if (
      err instanceof errors.JWTExpired &&
      !pathname.startsWith("/api/") &&
      request.cookies.has("refresh_token")
    ) {
      const next = pathname + request.nextUrl.search;
      const refreshUrl = new URL("/api/auth/silent-refresh", request.url);
      refreshUrl.searchParams.set("next", next);
      return NextResponse.redirect(refreshUrl);
    }

    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const res = NextResponse.redirect(new URL("/login", request.url));
    res.cookies.delete("access_token");
    return res;
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
