import { createElement } from "react";
import { renderToStaticMarkup } from "../helpers/render-localized";
import { beforeEach, expect, it, vi } from "vitest";
import ReportingSourceStatus from "@/components/merchandising/reporting-source-status/reporting-source-status";
import type { ReportingSources } from "@/lib/reporting-source-contract";
const state = vi.hoisted(() => ({ lang: "uk" as "uk" | "en", data: null as ReportingSources | null, error: false, retry: vi.fn() }));
vi.mock("@/components/language-provider/language-provider", () => ({ useLang: () => ({ lang: state.lang }) }));
vi.mock("@/components/merchandising/use-reporting-source-status", () => ({ useReportingSourceStatus: () => state }));
const render = (props = {}) => renderToStaticMarkup(createElement(ReportingSourceStatus, props));
function select(provider: "sheets" | "salesdrive" | "csv") {
  state.data = { sourceId: "selected", revision: 1, connections: [{ sourceId: "selected", provider, accountHost: "Demo", revision: 1, lastCheck: null, readiness: "READY", selectable: true }] };
}
beforeEach(() => { state.lang = "uk"; state.data = null; state.error = false; state.retry.mockClear(); });
it.each(["uk", "en"] as const)("renders loading, error and recovery in %s", lang => {
  state.lang = lang;
  expect(render()).toContain('role="status"');
  expect(render()).toContain(lang === "uk" ? "Перевіряємо джерело" : "Checking reporting source");
  state.error = true;
  expect(render()).toContain('role="alert"');
  expect(render()).toContain(lang === "uk" ? "Повторити перевірку" : "Retry source check");
  const tree = ReportingSourceStatus({});
  tree.props.children[0].props.children[1].props.onClick();
  expect(state.retry).toHaveBeenCalledOnce();
});
it.each([["sheets", "Google Sheets"], ["salesdrive", "SalesDrive"], ["csv", "csv"]] as const)("preserves the displayed provider name for %s", (provider, name) => {
  select(provider);
  expect(render()).toContain(`${name} · Demo`);
});
it("keeps selected source visible in compact mode while hiding help and its link", () => {
  select("sheets");
  expect(render()).toContain("/overview");
  const compact = render({ compact: true });
  expect(compact).toContain("Google Sheets · Demo");
  expect(compact).not.toContain("<a ");
  expect(compact).not.toContain("Дані джерела готові");
});
it.each(["uk", "en"] as const)("preserves no-selection help and the optional tab explanation in %s", lang => {
  state.lang = lang;
  state.data = { sourceId: null, revision: 1, connections: [] };
  const html = render({ explainTabs: true });
  expect(html).toContain(lang === "uk" ? "не вибрано" : "not selected");
  expect(html).toContain("/settings");
  expect(html).toContain(lang === "uk" ? "Вкладки Google Sheets / SalesDrive" : "The Google Sheets / SalesDrive tabs");
  expect(render()).not.toContain(lang === "uk" ? "Вкладки Google Sheets / SalesDrive" : "The Google Sheets / SalesDrive tabs");
});
