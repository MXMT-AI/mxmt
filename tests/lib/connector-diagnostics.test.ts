import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import ConnectorDiagnostics from "@/components/settings/connector-diagnostics/connector-diagnostics";
import type { ConnectionCheck } from "@/lib/connectors/contract";
const check: ConnectionCheck = {
  checkedAt: "2026-11-15T12:00:00Z", ok: true,
  metadata: { shopId: "demo-shop", appId: "demo-app", apiVersion: "v1", timezone: "Europe/Kyiv", scopes: ["read_orders", "read_products"] },
  checks: [{ resource: "orders", code: "OK" }],
  statuses: { entries: [{ id: "new", name: "New order" }], complete: false, reason: "UNSUPPORTED" },
  channels: { entries: [{ id: "web", name: "Website" }], complete: false, reason: "PAGED" },
};
it("renders nothing before a connection check exists", () => {
  expect(renderToStaticMarkup(createElement(ConnectorDiagnostics, { check: null, lang: "en" }))).toBe("");
});
it.each(["uk", "en"] as const)("renders metadata, resource results and distinct dictionary warnings in %s", lang => {
  const html = renderToStaticMarkup(createElement(ConnectorDiagnostics, { check, lang }));
  expect(html).toContain('aria-live="polite"');
  expect(html).toContain("demo-shop · v1 · Europe/Kyiv");
  expect(html).toContain("read_orders, read_products");
  expect(html).toContain(lang === "en" ? "Orders: Access confirmed" : "Замовлення: Доступ є");
  expect(html).toContain(lang === "en" ? "Unavailable from this source." : "Не підтримується джерелом.");
  expect(html).toContain(lang === "en" ? "The dictionary is incomplete." : "Довідник неповний.");
  expect(html).toContain("new: New order");
  expect(html).toContain("web: Website");
});
it("hides optional metadata and warnings for complete dictionaries while limiting previews to 100 entries", () => {
  const { metadata, ...withoutMetadata } = check;
  const dictionary = { complete: true, reason: null, entries: Array.from({ length: 101 }, (_, i) => ({ id: `id${i}`, name: `Entry ${i}` })) };
  const html = renderToStaticMarkup(createElement(ConnectorDiagnostics, { check: { ...withoutMetadata, statuses: dictionary, channels: dictionary }, lang: "en" }));
  expect(html).not.toContain("Shop, API version");
  expect(html).not.toContain("incomplete");
  expect(html).not.toContain("Unavailable from this source");
  expect(html.match(/id99: Entry 99/g)).toHaveLength(2);
  expect(html).not.toContain("id100:");
});
it("retains unrecognized diagnostic resource and code text", () => {
  const unknown = { ...check, checks: [{ resource: "future-resource", code: "FUTURE_CODE" }] } as unknown as ConnectionCheck;
  const html = renderToStaticMarkup(createElement(ConnectorDiagnostics, { check: unknown, lang: "en" }));
  expect(html).toContain("future-resource: FUTURE_CODE");
});
