import { createElement } from "react";
import { it, expect, vi } from "vitest";
import { Button } from "@/components/ui/button/button";
import { renderToStaticMarkup } from "../helpers/render-localized";
import {
  reportingErrorHelp,
  reportingSourceHelp,
} from "@/lib/reporting-readiness-copy";
import ReportingError from "@/components/merchandising/reporting-error/reporting-error";
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

it("forwards retry to a non-submit button", () => {
  const onRetry = vi.fn();
  const panel = ReportingError({ code: "SCREEN_DATA_UNAVAILABLE", lang: "en", onRetry });
  const retry = panel.props.children[2].props.children[0];
  expect(retry.type).toBe(Button);
  const button = Button(retry.props);
  expect(button.props.type).toBe("button");
  button.props.onClick!({} as never);
  expect(onRetry).toHaveBeenCalledOnce();
});

it.each([undefined, "Sales"])("preserves the optional page heading: %s", title => {
  const markup = renderToStaticMarkup(createElement(ReportingError, {
    code: "SCREEN_DATA_UNAVAILABLE", lang: "en", title, onRetry: () => {},
  }));
  if (title) {
    expect(markup).toMatch(/<h1[^>]*>Sales<\/h1>/);
    expect(markup).toContain("text-2xl");
    expect(markup).toContain("tracking-normal");
    expect(markup).toContain("text-inherit");
  } else expect(markup).not.toContain("<h1");
});
