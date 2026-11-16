import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { ImportJobDetails } from "@/components/settings/import-job-details/import-job-details";
import type { Progress } from "@/components/settings/sales-drive-import-card/import-types";
const job: Progress = {
  id: "job", state: "COMPLETE", mode: "BACKFILL", issues: [], errorCode: null,
  availableAt: "2026-11-15T12:00:00Z", updatedAt: "2026-11-15T12:00:00Z",
  stats: { pages: 1, orders: 2, imported: 3, duplicate: 0, stale: 0, quarantined: 0, receipts: 4, products: 5, snapshots: 6, prices: 0 },
};
it.each(["uk", "en"] as const)("keeps order, inventory and synchronization counters distinct in %s", lang => {
  const render = (resource: "orders" | "inventory" | "sync") => renderToStaticMarkup(createElement(ImportJobDetails, { job, resource, lang }));
  const orders = render("orders"), inventory = render("inventory");
  expect(orders.match(/<dt /g)).toHaveLength(6);
  expect(orders).toContain(lang === "uk" ? "Замовлення" : "Orders");
  expect(orders).not.toContain(lang === "uk" ? "Знімки" : "Snapshots");
  expect(inventory.match(/<dt /g)).toHaveLength(4);
  expect(inventory).toContain(lang === "uk" ? "Знімки" : "Snapshots");
  expect(inventory).not.toContain(lang === "uk" ? "Замовлення" : "Orders");
  expect(inventory).toMatch(/<dd[^>]*>0<\/dd>/);
  expect(render("sync")).not.toContain("<dl");
});
it.each(["uk", "en"] as const)("preserves retry and generic-source quality guidance in %s", lang => {
  const html = renderToStaticMarkup(createElement(ImportJobDetails, {
    job: { ...job, state: "RETRY", stats: { warnings: 1 }, issues: ["SOURCE_PAGINATION_NOT_SNAPSHOT"], errorCode: "AUTH_FAILED" },
    resource: "sync", lang, generic: true,
  }));
  expect(html).toContain(lang === "uk" ? "Є попередження якості даних" : "Data quality warnings exist");
  expect(html).toContain(lang === "uk" ? "Наступна спроба не раніше" : "Next attempt after");
  expect(html).toContain(lang === "uk" ? "Сторінки джерела" : "Source pages");
  expect(html).toContain(lang === "uk" ? "Завершіть налаштування з’єднання" : "Complete connection setup");
  expect(html).not.toContain("SalesDrive");
});
it("does not show warning or retry guidance for a clean completed job", () => {
  const html = renderToStaticMarkup(createElement(ImportJobDetails, { job, resource: "orders", lang: "en" }));
  expect(html).not.toContain("Data quality warnings");
  expect(html).not.toContain("Next attempt after");
  expect(html).not.toContain("Reason:");
});
