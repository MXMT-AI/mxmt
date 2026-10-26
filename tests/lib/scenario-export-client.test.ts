import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect, vi } from "vitest";
import { ExportAttempt, exportCopy } from "@/lib/scenario-export-client";
import Panel from "@/components/merchandising/ScenarioExportPanel";
import type { useScenarioExport } from "@/components/merchandising/useScenarioExport";
const receipt = {
  exportId: "e",
  actionId: "a",
  kind: "reorder" as const,
  previewId: "p",
  createdAt: "2026-10-26T10:00:00Z",
  actorId: "owner",
  files: [
    {
      id: "f",
      name: "supplier-UAH.csv",
      sha256: "hash",
      byteLength: 12,
      rowCount: 2,
      supplierId: "supplier",
      currency: "UAH",
      url: "/api/merchandising/exports/e?fileId=f",
    },
  ],
};
const state = {
  receipt,
  busy: false,
  error: "",
  history: [receipt],
  historyError: false,
  prepare: async () => {},
  reloadHistory: () => {},
} satisfies ReturnType<typeof useScenarioExport>;
describe("export retry identity and download/history UI", () => {
  it("keeps the same ID after an uncertain response, then creates a new ID for a deliberate new export", () => {
    const attempt = new ExportAttempt(),
      create = vi.fn().mockReturnValueOnce("one").mockReturnValueOnce("two");
    expect(attempt.id("intent", create)).toBe("one");
    expect(attempt.id("intent", create)).toBe("one");
    expect(create).toHaveBeenCalledTimes(1);
    attempt.complete("intent");
    expect(attempt.id("intent", create)).toBe("two");
  });
  it.each(["uk", "en"] as const)(
    "renders prepared file links and actor/time history in %s",
    (lang) => {
      const html = renderToStaticMarkup(
        createElement(Panel, { state, previewId: "p", allowed: true, lang }),
      );
      expect(html).toContain(exportCopy[lang].prepared);
      expect(html).toContain('download="supplier-UAH.csv"');
      expect(html).toContain('dateTime="2026-10-26T10:00:00Z"');
      expect(html).toContain("owner");
      expect(html).toContain(exportCopy[lang].history);
    },
  );
  it("withholds download actions from viewers and identifies exports prepared for an earlier scenario", () => {
    const viewer = renderToStaticMarkup(
      createElement(Panel, {
        state,
        previewId: "new",
        allowed: false,
        lang: "en",
      }),
    );
    expect(viewer).toContain(exportCopy.en.readOnly);
    expect(viewer).toContain(exportCopy.en.earlier);
    expect(viewer).not.toContain("download=");
  });
});
