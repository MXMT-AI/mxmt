import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { ImportSyncProgress } from "@/components/settings/import-sync-progress/import-sync-progress";
import type { Progress } from "@/components/settings/sales-drive-import-card/import-types";
const job: Progress = { id: "cycle-1", state: "PAUSED", mode: "SYNC", stats: {}, issues: [], errorCode: null, availableAt: "2026-11-15T12:00:00Z", updatedAt: "2026-11-15T12:00:00Z" };
it.each([
  ["COMPLETE", "Metrics recalculated."],
  ["WAITING_ENGINE", "Inputs imported. Updating sales and stock metrics…"],
  ["PENDING", "Inputs imported. Updating sales and stock metrics…"],
  ["RUNNING", "Inputs imported. Updating sales and stock metrics…"],
  ["FAILED", "Could not update metrics. We will retry automatically."],
])("renders one calculation message for %s", (state, message) => {
  const html = renderToStaticMarkup(createElement(ImportSyncProgress, { job: null, syncInfo: { calculation: { state } }, lang: "en" }));
  expect(html).toContain(message);
  expect(html).toContain('role="status" aria-live="polite"');
  expect(html).not.toContain("Cycle:");
});
it.each(["uk", "en"] as const)("preserves missing scheduler, paused cycle, zero counts and lag coverage in %s", lang => {
  const html = renderToStaticMarkup(createElement(ImportSyncProgress, { job, lang, generic: true, syncInfo: {
    backfill: { id: "backfill", state: "COMPLETE", stats: {} },
    resources: [
      { resource: "orders", pending: 0, lastSuccess: null, lagSeconds: 61, errorCode: "AUTH_FAILED" },
      { resource: "stock", pending: 0, lastSuccess: null, lagSeconds: null, errorCode: null },
    ],
  } }));
  expect(html).toContain("cycle-1");
  expect(html).toContain(lang === "uk" ? "підключіть зовнішній планувальник" : "connect an external scheduler");
  expect(html).toContain(lang === "uk" ? "Відновіть цикл" : "Resume this cycle");
  expect(html).toContain(lang === "uk" ? "сторінок 0" : "pages 0");
  expect(html).toContain(lang === "uk" ? "замовлень 0" : "orders 0");
  expect(html.match(lang === "uk" ? /у черзі 0/g : /pending 0/g)).toHaveLength(2);
  expect(html.match(lang === "uk" ? /Відставання \(хв\): 2/g : /Lag \(min\): 2/g)).toHaveLength(1);
  expect(html).toContain(lang === "uk" ? "Завершіть налаштування з’єднання" : "Complete connection setup");
  expect(html).not.toContain("SalesDrive");
});
it("renders completion timestamps and preserves zero lag", () => {
  const timestamp = "2026-11-15T12:00:00Z";
  const html = renderToStaticMarkup(createElement(ImportSyncProgress, { job: { ...job, state: "COMPLETE" }, lang: "en", syncInfo: {
    lastTickAt: timestamp,
    resources: [{ resource: "orders", pending: 0, lastSuccess: timestamp, lagSeconds: 0, errorCode: null }],
  } }));
  expect(html).toContain(`Completed: ${new Date(timestamp).toLocaleString("en-GB")}`);
  expect(html).toContain(`Last scheduler tick: ${new Date(timestamp).toLocaleString("en-GB")}`);
  expect(html).toContain("Lag (min): 0");
  expect(html).not.toContain("Resume this cycle");
});
