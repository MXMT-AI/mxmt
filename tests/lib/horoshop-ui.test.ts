import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import HoroshopConnectionCard from "@/components/settings/HoroshopConnectionCard";
const initial = {
  configured: false,
  accountHost: null,
  hasReceiptsKey: false,
  hasYmlUrl: false,
  revision: null,
  lastCheck: null,
};
it("provides write-only credentials, explicit evidence and unsupported-event guidance using shared controls", () => {
  const html = renderToStaticMarkup(
    React.createElement(HoroshopConnectionCard, {
      initial,
      lang: "en",
      canManage: true,
    }),
  );
  for (const text of [
    'name="password"',
    'type="password"',
    'name="login"',
    'name="mappingApproved"',
    'name="requestsPerWindow"',
    "A paid flag does not establish a full-payment date",
    "Each refresh rescans the entire accessible order history",
    "Check read scopes",
  ])
    expect(html).toContain(text);
  expect(html).not.toContain('name="statuses"');
  const viewer = renderToStaticMarkup(
    React.createElement(HoroshopConnectionCard, {
      initial,
      lang: "uk",
      canManage: false,
    }),
  );
  expect(viewer).not.toContain("<form");
  expect(viewer).not.toContain('name="password"');
});
it.each(["uk", "en"] as const)(
  "uses shared localized resource diagnostics in %s",
  (lang) => {
    const lastCheck: any = {
      ok: false,
      checkedAt: "2026-10-27T16:00:00.000Z",
      checks: [
        { resource: "orders", code: "AUTH_FAILED" },
        { resource: "catalog", code: "RATE_LIMITED" },
        { resource: "receipts", code: "NOT_CONFIGURED" },
      ],
      statuses: { entries: [], complete: false, reason: "NOT_CHECKED" },
      channels: { entries: [], complete: false, reason: "UNSUPPORTED" },
    };
    const html = renderToStaticMarkup(
      React.createElement(HoroshopConnectionCard, {
        initial: { ...initial, lastCheck },
        lang,
        canManage: false,
      }),
    );
    expect(html).toContain(
      lang === "uk"
        ? "Перевірте ключ і права читання"
        : "Check the key and read permissions",
    );
    expect(html).not.toContain("AUTH_FAILED");
    expect(html).not.toContain("RATE_LIMITED");
  },
);
