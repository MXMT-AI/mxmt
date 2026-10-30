import { createElement } from "react";
import { it, expect } from "vitest";
import { renderToStaticMarkup } from "../helpers/render-localized";
import {
  reportingErrorHelp,
  reportingSourceHelp,
} from "@/lib/reporting-readiness-copy";
import ReportingError from "@/components/merchandising/ReportingError";
import type { ReportingSourceChoice } from "@/lib/reporting-source-contract";
const source = (
  readiness: ReportingSourceChoice["readiness"],
  provider: ReportingSourceChoice["provider"] = "sheets",
): ReportingSourceChoice => ({
  sourceId: "sheet",
  provider,
  accountHost: "Synthetic source",
  revision: 1,
  lastCheck: null,
  readiness,
  selectable: readiness !== "MAPPING_REQUIRED",
});
it("routes missing selection and mapping approval to Settings", () => {
  expect(reportingSourceHelp(undefined, "uk")).toMatchObject({
    href: "/settings",
  });
  expect(reportingSourceHelp(source("MAPPING_REQUIRED"), "en")).toMatchObject({
    href: "/settings",
    message: expect.stringContaining("mapping needs approval"),
  });
});
it("distinguishes Sheets projection from remote access/import requirements", () => {
  expect(reportingSourceHelp(source("IMPORT_REQUIRED"), "en").href).toBe(
    "/data-reporting?provider=sheets",
  );
  expect(
    reportingSourceHelp(source("IMPORT_REQUIRED", "salesdrive"), "en").href,
  ).toBe("/settings");
  expect(
    reportingSourceHelp(source("CONNECTION_CHECK_REQUIRED", "salesdrive"), "uk")
      .href,
  ).toBe("/settings");
});
it("does not equate ready inputs with complete historical evidence", () => {
  expect(reportingSourceHelp(source("READY"), "en").message).toContain(
    "History completeness",
  );
  expect(reportingSourceHelp(source("READY"), "uk").message).toContain(
    "Повнота історії",
  );
});
it("keeps unknown infrastructure text out of rendered recovery messages", () => {
  const markup = renderToStaticMarkup(
    createElement(ReportingError, {
      code: "postgres://private-key@host",
      lang: "en",
      title: "Sales",
      onRetry: () => {},
    }),
  );
  expect(markup).not.toContain("private-key");
  expect(markup).toContain('role="alert"');
  expect(markup).toContain('href="/en/settings"');
  expect(markup).toContain("Retry");
});
it("renders actionable Sheets recovery consistently in both languages", () => {
  for (const lang of ["uk", "en"] as const) {
    const help = reportingErrorHelp("SHEETS_IMPORT_REQUIRED", lang);
    const markup = renderToStaticMarkup(
      createElement(ReportingError, {
        code: "SHEETS_IMPORT_REQUIRED",
        lang,
        onRetry: () => {},
      }),
    );
    expect(markup).toContain(help.href);
    expect(markup).toContain(help.action.replaceAll("&", "&amp;"));
    expect(help.message).not.toBe(
      reportingErrorHelp("SCREEN_DATA_UNAVAILABLE", lang).message,
    );
  }
});
