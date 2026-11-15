import { createElement } from "react";
import { renderToStaticMarkup } from "../helpers/render-localized";
import { describe, it, expect, vi } from "vitest";
import { ExportAttempt, exportCopy } from "@/lib/scenario-export-client";
import Panel from "@/components/merchandising/scenario-export-panel/scenario-export-panel";
import type { useScenarioExport } from "@/components/merchandising/use-scenario-export";
vi.mock("next/navigation", async load => ({
  ...await load<typeof import("next/navigation")>(),
  useSearchParams: () => new URLSearchParams("snapshotId=frozen&channelId=2&chatTopic=old&chatExportId=old"),
}));
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
  it("retains unresolved IDs when switching suppliers or scenario targets and completes only the confirmed key", () => {
    const attempt = new ExportAttempt();
    const create = vi
      .fn()
      .mockReturnValueOnce("supplier-a-original")
      .mockReturnValueOnce("supplier-b-original")
      .mockReturnValueOnce("global-original")
      .mockReturnValueOnce("supplier-b-new");
    const supplierA = JSON.stringify([
      "reorder",
      "preview",
      { supplierId: "a", currency: "UAH" },
    ]);
    const supplierB = JSON.stringify([
      "reorder",
      "preview",
      { supplierId: "b", currency: "UAH" },
    ]);
    const all = JSON.stringify(["reorder", "preview", null]);
    expect(attempt.id(supplierA, create)).toBe("supplier-a-original");
    expect(attempt.id(supplierB, create)).toBe("supplier-b-original");
    expect(attempt.id(all, create)).toBe("global-original");
    attempt.complete(supplierB);
    attempt.complete("unrelated");
    expect(attempt.id(supplierA, create)).toBe("supplier-a-original");
    expect(attempt.id(all, create)).toBe("global-original");
    expect(attempt.id(supplierB, create)).toBe("supplier-b-new");
    expect(create).toHaveBeenCalledTimes(4);
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

it.each(["reprice", "reorder"] as const)("preserves report context when asking about a %s export", kind => {
  const html = renderToStaticMarkup(createElement(Panel, {
    state: { ...state, receipt: { ...receipt, kind } }, previewId: "p", allowed: true, lang: "en",
  }));
  expect(html).toContain(`snapshotId=frozen&amp;channelId=2&amp;chatTopic=${kind === "reprice" ? "repricing" : "reordering"}&amp;chatExportId=e&amp;chat=1`);
  const earlier = renderToStaticMarkup(createElement(Panel, { state, previewId: "new", allowed: true, lang: "en" }));
  expect(earlier).not.toContain("chatExportId=");
});

it.each([
  ["EXPORT_NOT_READY", "notReady"], ["EXPORT_PREVIEW_MISMATCH", "changed"],
  ["EXPORT_ID_CONFLICT", "conflict"], ["FORBIDDEN", "readOnly"],
  ["UNEXPECTED", "error"], ["constructor", "error"],
] as const)("preserves recovery text for %s", (error, key) => {
  const html = renderToStaticMarkup(createElement(Panel, {
    state: { ...state, error }, previewId: "p", allowed: true, lang: "en",
  }));
  expect(html).toContain(exportCopy.en[key]);
  expect(html).toContain('role="alert"');
});
