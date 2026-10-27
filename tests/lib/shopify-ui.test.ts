import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import ShopifyConnectionCard from "@/components/settings/ShopifyConnectionCard";
const initial = {
  configured: false,
  accountHost: null,
  hasReceiptsKey: false,
  hasYmlUrl: false,
  revision: null,
  lastCheck: null,
};
it("keeps the token write-only, explains 60-day/all-orders limits and requires explicit stock and financial approval", () => {
  const html = renderToStaticMarkup(
    React.createElement(ShopifyConnectionCard, {
      initial,
      lang: "en",
      canManage: true,
    }),
  );
  for (const value of [
    'name="accessToken"',
    'type="password"',
    'name="mappingApproved"',
    'name="locationIds"',
    "read_all_orders",
    "60 days",
    "historical COGS",
    "on_hand",
    "shopMoney",
    "Check read scopes",
  ])
    expect(html).toContain(value);
  expect(html).not.toContain('name="costPrice"');
  const viewer = renderToStaticMarkup(
    React.createElement(ShopifyConnectionCard, {
      initial,
      lang: "uk",
      canManage: false,
    }),
  );
  expect(viewer).not.toContain("<form");
  expect(viewer).not.toContain('name="accessToken"');
});
it.each(["uk", "en"] as const)(
  "localizes new Shopify diagnostics in %s",
  (lang) => {
    const lastCheck: any = {
      checkedAt: "2026-10-27T16:00:00Z",
      ok: false,
      checks: [
        { resource: "identity", code: "AUTH_FAILED" },
        { resource: "history", code: "NOT_CONFIGURED" },
        { resource: "locations", code: "OK" },
        { resource: "cost", code: "OK" },
      ],
      statuses: { entries: [], complete: true, reason: null },
      channels: { entries: [], complete: false, reason: "UNSUPPORTED" },
    };
    const html = renderToStaticMarkup(
      React.createElement(ShopifyConnectionCard, {
        initial: { ...initial, lastCheck },
        lang,
        canManage: false,
      }),
    );
    expect(html).toContain(
      lang === "uk" ? "Повнота історії" : "History coverage",
    );
    expect(html).not.toContain("AUTH_FAILED");
  },
);
