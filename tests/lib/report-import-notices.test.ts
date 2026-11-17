import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { ReportImportNotices } from "@/components/data-reporting/report-import-notices/report-import-notices";

vi.mock("@/i18n/navigation", () => ({ Link: (props: ComponentProps<"a">) => createElement("a", props) }));
const base = { connection: null, source: null, latestImport: null };
const render = (overrides: Partial<Parameters<typeof ReportImportNotices>[0]> = {}) => renderToStaticMarkup(createElement(ReportImportNotices, { lang: "en", status: base, statusLoading: false, viewRefreshed: false, ...overrides }));
afterEach(() => vi.useRealTimers());

it.each(["uk", "en"] as const)("shows configuration guidance only after status loads in %s", lang => {
  const html = render({ lang });
  expect(html).toContain('href="/settings"');
  expect(html).toContain(lang === "uk" ? "Спочатку прив’яжіть" : "Connect this cabinet");
  expect(render({ lang, statusLoading: true })).not.toContain('href="/settings"');
});

it("keeps the next spreadsheet distinct from the currently imported source", () => {
  const html = render({ status: { ...base, connection: { fileId: "new-sheet", revision: 2 }, source: { name: "Old source", timezone: "Europe/Kyiv", updatedAt: "2026-11-17", driveFileId: "old-sheet" } } });
  expect(html).toContain('href="https://docs.google.com/spreadsheets/d/new-sheet/edit"');
  expect(html).toContain("Saving a connection does not replace imported data");
  expect(html).not.toContain('href="/settings"');
});

it.each([false, true])("distinguishes a live import from an expired one (%s)", expired => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-17T00:20:00Z"));
  const html = render({ status: { ...base, latestImport: { status: "RUNNING", createdAt: expired ? "2026-11-17T00:00:00Z" : "2026-11-17T00:19:00Z" } } });
  expect(html).toContain('role="status"');
  expect(html).toContain(expired ? "previous import exceeded its execution window" : "Status is checked every 10 seconds");
});

it("shows the refresh confirmation only when requested", () => {
  expect(render()).not.toContain("Saved-data view refreshed");
  expect(render({ viewRefreshed: true })).toContain("Saved-data view refreshed");
});
