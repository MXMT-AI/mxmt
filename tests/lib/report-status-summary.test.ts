import { expect, it } from "vitest";
import { ReportStatusSummary } from "@/components/data-reporting/report-status-summary/report-status-summary";
import type { DataStatus } from "@/components/data-reporting/use-report-status/use-report-status";

const copy = { dataStatus: "Data status", source: "Source", noSource: "Not configured", lastImport: "Import", report: "Calculation", noRuns: "Not run", issues: "Issues", warning: "Warning", success: "Success" };
const base: DataStatus = { connection: null, configured: false, source: null, activeImport: null, latestImport: null, calculation: null, issueCounts: {} };
type Card = { props: { value: string; detail: string; status?: string; loading: boolean } };
const cards = (status: DataStatus | null, loading = false) => ReportStatusSummary({ status, loading, locale: "en-GB", copy }).props.children as Card[];

it("keeps missing data separate from a zero issue count", () => {
  const values = cards(null);
  expect(values.map(card => card.props.value)).toEqual([copy.noSource, "—", "—", "0"]);
  expect(values.map(card => card.props.detail)).toEqual(["Europe/Kyiv", copy.noRuns, copy.noRuns, copy.success]);
  expect(values[3].props.status).toBe("SUCCESS");
});

it("prefers active import completion over the latest attempted import and sums issues", () => {
  const status: DataStatus = { ...base,
    activeImport: { status: "SUCCESS", completedAt: "active-completed", finishedAt: "active-finished", activatedAt: "active-activated" },
    latestImport: { status: "FAILED", createdAt: "latest-created", finishedAt: "latest-finished" },
    calculation: { status: "WARNING", dateFrom: "2026-11-01", dateTo: "2026-11-17", asOfDate: "2026-11-17", completedAt: "calculation-completed", finishedAt: "calculation-finished", createdAt: "calculation-created" },
    issueCounts: { missingCost: 2, missingSku: 3 },
  };
  const result = cards(status);
  expect(result.map(card => card.props.value)).toEqual([copy.noSource, "active-completed", "calculation-completed", "5"]);
  expect(result.map(card => card.props.status)).toEqual([undefined, "SUCCESS", "WARNING", "WARNING"]);
});

it("falls back to the latest attempted import when no active import exists", () => {
  const result = cards({ ...base, latestImport: { status: "RUNNING", createdAt: "latest-created" } });
  expect(result[1].props.value).toBe("latest-created");
  expect(result[1].props.detail).toBe("RUNNING");
});

it("passes loading to every card and uses the supplied section label", () => {
  expect(cards(base, true).every(card => card.props.loading)).toBe(true);
  expect(ReportStatusSummary({ status: base, loading: false, locale: "uk-UA", copy: { ...copy, dataStatus: "Стан даних" } }).props["aria-label"]).toBe("Стан даних");
});
