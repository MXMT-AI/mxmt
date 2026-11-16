import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getT } from "@/lib/translations";
import type { NavigationOptions } from "@/lib/merchandising-navigation-store";
const state = vi.hoisted(() => ({
  lang: "uk" as "uk" | "en",
  path: "/stock",
  query:
    "period=month&dateFrom=2026-09-01&dateTo=2026-09-30&channelId=2&snapshotId=frozen",
}));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  usePathname: () => state.path,
  useSearchParams: () => new URLSearchParams(state.query),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/i18n/navigation", () => ({
  usePathname: () => state.path,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  Link: ({ children, ...props }: Record<string, unknown>) =>
    createElement("a", props, children as string),
}));
vi.mock("@/components/language-provider/language-provider", () => ({
  useLang: () => ({ lang: state.lang, t: getT(state.lang) }),
}));
import Sidebar from "@/components/sidebar/sidebar";
import Shell from "@/components/merchandising/merchandising-shell/merchandising-shell";
const options = {
  monobrand: false,
  channels: [{ id: "1" }, { id: "2" }],
  truncated: false,
};
const render = (config: NavigationOptions | null = options) =>
  renderToStaticMarkup(
    createElement(Shell, {
      options: config,
      now: "2026-10-25T10:00:00Z",
      children: createElement("div", { "data-testid": "report-content" }, "Report content"),
    }),
  );
beforeEach(() => {
  state.lang = "uk";
  state.path = "/stock";
  state.query =
    "period=month&dateFrom=2026-09-01&dateTo=2026-09-30&channelId=2&snapshotId=frozen";
});
it.each(["/agents/research", "/data-reporting/import"])("opens existing tools for nested route %s", path => {
  state.path = path;
  const html = renderToStaticMarkup(createElement(Sidebar, { tenantName: "Fixture", userRole: "VIEWER" }));
  expect(html).toMatch(/<details open="" class="pt-3">/);
  expect(html.match(/aria-current="page"/g)).toHaveLength(2);
});
it("does not match a sibling route by a partial prefix", () => {
  state.path = "/agents-extra";
  const html = renderToStaticMarkup(createElement(Sidebar, { tenantName: "Fixture", userRole: "VIEWER" }));
  expect(html).not.toMatch(/<details open="" class="pt-3">/);
  expect(html).not.toContain('aria-current="page"');
});
describe("localized merchandising shell", () => {
  it.each(["uk", "en"] as const)(
    "renders labeled filters and report content in %s",
    (lang) => {
      state.lang = lang;
      const html = render();
      expect(html).toContain(
        lang === "uk" ? "Канал продажів" : "Sales channel",
      );
      expect(html).toContain(lang === "uk" ? "Усі канали" : "All channels");
      expect(html).toContain('value="2" selected=""');
      expect(html).toContain('data-testid="report-content"');
    },
  );
  it("offers recovery for invalid links without rendering report content", () => {
    state.query = "period=custom&dateFrom=broken&dateTo=2026-09-30";
    const html = render();
    expect(html).toContain('role="alert"');
    expect(html).toContain("Скинути фільтри");
    expect(html).not.toContain('data-testid="report-content"');
  });
  it("preserves the selected channel when it is missing from available options", () => {
    state.query = state.query.replace("channelId=2", "channelId=external");
    expect(render()).toContain('value="external" selected=""');
  });
  it("offers retry without rendering filters or report content when options are unavailable", () => {
    const html = render(null);
    expect(html).toContain('role="alert"');
    expect(html).toContain("Спробувати ще раз");
    expect(html).not.toContain('name="period"');
    expect(html).not.toContain('data-testid="report-content"');
  });
  it("separates existing tools while preserving their routes and filter context", () => {
    const html = renderToStaticMarkup(
      createElement(Sidebar, { tenantName: "Fixture", userRole: "VIEWER" }),
    );
    for (const path of [
      "overview",
      "sales",
      "stock",
      "repricing",
      "reordering",
      "agents",
      "calendar",
      "assortment",
      "settings",
    ])
      expect(html).toContain(`/${path}?period=month`);
    expect(html).toContain("Інші інструменти");
    expect(html).toContain('aria-current="page"');
    const limited = renderToStaticMarkup(
      createElement(Sidebar, {
        tenantName: "Fixture",
        userRole: "VIEWER",
        features: { merchandising: true, legacy: false },
      }),
    );
    expect(limited).not.toContain("/agents?");
    expect(limited).toContain("/repricing?");
  });
});
