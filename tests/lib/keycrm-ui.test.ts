import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import KeyCrmConnectionCard from "@/components/settings/KeyCrmConnectionCard";
const initial = {
  configured: false,
  accountHost: null,
  hasReceiptsKey: false,
  hasYmlUrl: false,
  revision: null,
  lastCheck: null,
};
it("keeps KeyCRM credentials write-only, requires explicit mapping evidence and provides independent read diagnostics", () => {
  const admin = renderToStaticMarkup(
    React.createElement(KeyCrmConnectionCard, {
      initial,
      lang: "en",
      canManage: true,
    }),
  );
  expect(admin).toContain('type="password"');
  expect(admin).toContain('name="apiKey"');
  expect(admin).toContain("Check read scopes");
  expect(admin).toContain('name="mappingApproved"');
  expect(admin).toContain(
    "Successful reads do not prove the key has no write permissions",
  );
  expect(admin).toContain("Partial payment does not establish a sale");
  const viewer = renderToStaticMarkup(
    React.createElement(KeyCrmConnectionCard, {
      initial,
      lang: "uk",
      canManage: false,
    }),
  );
  expect(viewer).not.toContain("<form");
  expect(viewer).not.toContain('name="apiKey"');
});

it.each(["uk", "en"] as const)(
  "renders localized read diagnostics in %s with unknown-code fallback",
  (lang) => {
    const lastCheck = {
      checkedAt: "2026-10-27T12:00:00.000Z",
      ok: false,
      checks: [
        { resource: "orders", code: "AUTH_FAILED" },
        { resource: "stock", code: "RATE_LIMITED" },
        { resource: "receipts", code: "NOT_CONFIGURED" },
        { resource: "future-resource", code: "FUTURE_CODE" },
      ],
      statuses: { entries: [], complete: true, reason: null },
      channels: { entries: [], complete: true, reason: null },
    };
    const html = renderToStaticMarkup(
      React.createElement(KeyCrmConnectionCard, {
        initial: { ...initial, lastCheck: lastCheck as any },
        lang,
        canManage: false,
      }),
    );
    expect(html).toContain(
      lang === "uk"
        ? "Перевірте ключ і права читання"
        : "Check the key and read permissions",
    );
    expect(html).toContain(
      lang === "uk"
        ? "Ліміт запитів. Повторіть пізніше"
        : "Rate limit reached. Retry later",
    );
    expect(html).not.toContain("AUTH_FAILED");
    expect(html).not.toContain("RATE_LIMITED");
    expect(html).toContain("future-resource");
    expect(html).toContain("FUTURE_CODE");
  },
);
