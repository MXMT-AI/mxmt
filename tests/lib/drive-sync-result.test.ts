import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { DriveSyncResult } from "@/components/settings/drive-sync-result/drive-sync-result";
import { driveSyncStatus } from "@/components/settings/drive-sync-card/drive-sync-status";

it.each(["uk", "en"] as const)("keeps success totals separate from warnings and errors in %s", lang => {
  const importResult = { skus: 2, inventory: 3, sales: 4, sheets: [
    { name: "Products", imported: "2", skipped: "" },
    { name: "Orders", imported: "", skipped: "Invalid header" },
  ] };
  const render = (result: "ok" | "warn" | "error" | null) => renderToStaticMarkup(createElement(DriveSyncResult, {
    lang, result, errMsg: "Import diagnostic", importResult,
  }));
  const success = render("ok");
  expect(success).toContain("SKU: 2");
  expect(success).toContain("✓ «Products»: 2");
  expect(success).toContain("⚠ «Orders»: Invalid header");
  expect(success).toContain(lang === "uk" ? "Продажі: 4" : "Sales: 4");
  expect(success).not.toContain("Import diagnostic");
  const warning = render("warn");
  expect(warning).toContain(lang === "uk" ? "Імпортовано 0 записів" : "0 records imported");
  expect(warning).toContain("Import diagnostic");
  expect(warning).not.toContain("SKU:");
  const error = render("error");
  expect(error).toContain("Import diagnostic");
  expect(error).not.toContain("SKU:");
  expect(render(null)).toBe("");
});

it("preserves the running fallback for unknown statuses without inherited property collisions", () => {
  expect(driveSyncStatus("pending").en).toBe("Not synced");
  expect(driveSyncStatus("success").en).toBe("Synced successfully");
  expect(driveSyncStatus("error").en).toBe("Sync failed");
  expect(driveSyncStatus("unexpected")).toBe(driveSyncStatus("running"));
  expect(driveSyncStatus("toString")).toBe(driveSyncStatus("running"));
});
