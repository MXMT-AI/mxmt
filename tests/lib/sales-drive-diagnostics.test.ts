import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { SalesDriveDiagnostics } from "@/components/settings/sales-drive-diagnostics/sales-drive-diagnostics";
import type { ConnectionCheck } from "@/lib/connectors/contract";

const check: ConnectionCheck = {
  ok: true, checkedAt: "2026-11-15T12:00:00Z",
  checks: [{ resource: "catalog", code: "OK" }, { resource: "receipts", code: "AUTH_FAILED" }],
  statuses: { complete: false, reason: "PAGED", entries: Array.from({ length: 51 }, (_, index) => ({ id: `s${index}`, name: `Status ${index}` })) },
  channels: { complete: true, reason: null, entries: [{ id: "web", name: "Website" }] },
};
it("renders nothing before a check exists", () => {
  expect(renderToStaticMarkup(createElement(SalesDriveDiagnostics, { check: null, lang: "en" }))).toBe("");
});
it.each(["uk", "en"] as const)("preserves SalesDrive labels, Kyiv time, dictionary counts and the 50-entry limit in %s", lang => {
  const html = renderToStaticMarkup(createElement(SalesDriveDiagnostics, { check, lang }));
  expect(html).toContain(lang === "uk" ? "Товари та залишки" : "Products and stock");
  expect(html).toContain(lang === "uk" ? "Надходження" : "Receipts");
  expect(html).toContain("14:00");
  expect(html).toContain(lang === "uk" ? "Статуси (51)" : "Statuses (51)");
  expect(html).toContain("s49: Status 49");
  expect(html).not.toContain("s50:");
  expect(html).toContain("web: Website");
  expect(html).toContain(lang === "uk" ? "Показано перші 50 записів." : "Showing the first 50 entries.");
  expect(html.match(lang === "uk" ? /Довідник неповний/g : /The dictionary is incomplete/g)).toHaveLength(1);
  expect(html).not.toContain("AUTH_FAILED");
});
it("shows new resource and status codes rather than dropping their diagnostic text", () => {
  const unknown = { ...check, checks: [{ resource: "future-resource", code: "FUTURE_CODE" }] } as unknown as ConnectionCheck;
  const html = renderToStaticMarkup(createElement(SalesDriveDiagnostics, { check: unknown, lang: "en" }));
  expect(html).toContain("future-resource");
  expect(html).toContain("FUTURE_CODE");
});
