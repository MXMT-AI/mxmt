import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { SignJWT } from "jose";
import { proxy as middleware } from "@/proxy";
import { getPathname } from "@/i18n/navigation";
import { localizeHref } from "@/i18n/routing";
import { safeReturnPath } from "@/i18n/redirect";
import uk from "@/messages/uk.json";
import en from "@/messages/en.json";

function request(path: string, cookie = "") {
  return new NextRequest(`https://mxmt.example${path}`, {
    headers: { cookie, "accept-language": "en", "sec-fetch-dest": "document", "x-user-id": "forged" },
  });
}
async function token(expired = false) {
  return new SignJWT({ tenantId: "tenant", role: "ANALYST" })
    .setProtectedHeader({ alg: "HS256" }).setSubject("verified-user")
    .setExpirationTime(Math.floor(Date.now() / 1000) + (expired ? -60 : 600))
    .sign(new TextEncoder().encode(process.env.JWT_ACCESS_SECRET ?? "dev-access-secret-change-in-production"));
}

describe("locale routing and authentication", () => {
  it.each(["uk", "en"] as const)("renders public %s auth routes without a locale redirect", async locale => {
    const response = await middleware(request(`/${locale}/login`));
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-request-x-next-intl-locale")).toBe(locale);
    expect(response.cookies.get("lang")?.value).toBe(locale);
  });
  it("defaults old links to Ukrainian regardless of browser language", async () => {
    const response = await middleware(request("/settings?tab=general"));
    expect(response.headers.get("location")).toBe("https://mxmt.example/uk/settings?tab=general");
  });
  it("uses the saved preference for old links", async () => {
    const response = await middleware(request("/sales?snapshotId=frozen", "lang=en"));
    expect(response.headers.get("location")).toBe("https://mxmt.example/en/sales?snapshotId=frozen");
  });
  it("preserves the selected route and locale when authentication is required", async () => {
    const response = await middleware(request("/en/sales?snapshotId=frozen", "lang=uk"));
    const url = new URL(response.headers.get("location")!);
    expect(url.pathname).toBe("/en/login");
    expect(url.searchParams.get("next")).toBe("/en/sales?snapshotId=frozen");
  });
  it("forwards verified identity and URL locale together", async () => {
    const response = await middleware(request("/en/sales", `lang=uk; access_token=${await token()}`));
    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-request-x-user-id")).toBe("verified-user");
    expect(response.headers.get("x-middleware-request-x-tenant-id")).toBe("tenant");
    expect(response.headers.get("x-middleware-request-x-next-intl-locale")).toBe("en");
  });
  it("keeps locale and filters through silent refresh", async () => {
    const response = await middleware(request("/en/stock?currency=EUR", `access_token=${await token(true)}; refresh_token=present`));
    const url = new URL(response.headers.get("location")!);
    expect(url.pathname).toBe("/api/auth/silent-refresh");
    expect(url.searchParams.get("next")).toBe("/en/stock?currency=EUR");
  });
  it("keeps API authentication and public exceptions outside i18n", async () => {
    expect((await middleware(request("/api/data/sales"))).status).toBe(401);
    for (const path of ["/api/auth/login", "/api/health", "/api/cron/sync", "/api/webhooks/salesdrive/source"]) {
      const response = await middleware(request(path));
      expect(response.status).toBe(200);
      expect(response.headers.get("location")).toBeNull();
    }
    expect((await middleware(request("/api/authentic"))).status).toBe(401);
  });
  it("does not turn an unsupported explicit locale into another language", async () => {
    const response = await middleware(request("/fr/dashboard"));
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
});

describe("localized destinations", () => {
  it("builds language-specific links with query strings and fragments", () => {
    expect(getPathname({ locale: "en", href: "/settings?tab=general#data-quality-title" })).toBe("/en/settings?tab=general#data-quality-title");
    expect(localizeHref("/uk/sales?q=x#row", "en")).toBe("/en/sales?q=x#row");
    expect(localizeHref("/api/data/sales", "en")).toBe("/api/data/sales");
  });
  it.each(["//evil.example", "/\\evil.example", "/api/auth/logout", "/en/../api/auth/logout", "/en/login"])("rejects unsafe or looping return path %s", path => {
    expect(safeReturnPath(path, "en")).toBe("/en/dashboard");
  });
  it("preserves the active language and filter state on return", () => {
    expect(safeReturnPath("/uk/sales?currency=EUR#row", "en")).toBe("/en/sales?currency=EUR#row");
  });
  it("has the same translation keys in both languages", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(uk).sort());
  });
});
