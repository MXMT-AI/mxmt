import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import SalesDriveImportCard from "@/components/settings/sales-drive-import-card/sales-drive-import-card";
import { errorLabel, issueLabel } from "@/components/settings/sales-drive-import-card/copy";

it.each(["orders", "inventory", "sync"] as const)("keeps initial %s actions blocked until progress loads and viewer access limited to refresh", resource => {
  const manager = renderToStaticMarkup(createElement(SalesDriveImportCard, { resource, lang: "en", canManage: true }));
  expect(manager).toContain(`id="salesdrive-${resource}-import-title"`);
  expect(manager).toContain("Loading…");
  expect(manager).toMatch(/<button[^>]*disabled=""/);
  expect(manager).toContain('type="button"');
  const viewer = renderToStaticMarkup(createElement(SalesDriveImportCard, { resource, lang: "uk", canManage: false, generic: true }));
  expect(viewer).toContain(`id="connector-${resource}-import-title"`);
  expect(viewer.match(/<button/g)).toHaveLength(1);
  expect(viewer).toContain("Оновити прогрес");
});
it.each([false, true])("retains localized source-specific guidance with uk=%s", uk => {
  expect(errorLabel("AUTH_FAILED", uk, false)).toContain("SalesDrive");
  expect(errorLabel("AUTH_FAILED", uk, true)).not.toContain("SalesDrive");
  expect(errorLabel("NETWORK_ERROR", uk, false)).toContain("SalesDrive");
  expect(errorLabel("NETWORK_ERROR", uk, true)).not.toContain("SalesDrive");
  expect(issueLabel("SOURCE_PAGINATION_NOT_SNAPSHOT", uk, false)).toContain("SalesDrive");
  expect(issueLabel("SOURCE_PAGINATION_NOT_SNAPSHOT", uk, true)).not.toContain("SalesDrive");
  expect(issueLabel("INVALID_RECEIPT_LINE", uk, true)).toContain(uk ? "Некоректні надходження" : "Invalid receipts");
  expect(issueLabel("FUTURE_CODE", uk)).toBe(uk ? "Дані потребують перевірки." : "Source data needs review.");
  expect(errorLabel("FUTURE_CODE", uk)).toBe(uk ? "Імпорт не завершено. Перевірте з’єднання та відновіть його." : "The import could not finish. Check the connection and resume.");
});
