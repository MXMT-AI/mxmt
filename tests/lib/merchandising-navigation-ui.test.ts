import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getT } from "@/lib/translations";
const state = vi.hoisted(() => ({
  lang: "uk" as "uk" | "en",
  path: "/stock",
  query:
    "period=month&dateFrom=2026-09-01&dateTo=2026-09-30&channelId=2&snapshotId=frozen",
}));
vi.mock("next/navigation", () => ({
  usePathname: () => state.path,
  useSearchParams: () => new URLSearchParams(state.query),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("next/link", () => ({
  default: ({ children, ...props }: Record<string, unknown>) =>
    createElement("a", props, children as string),
}));
vi.mock("@/components/LanguageProvider", () => ({
  useLang: () => ({ lang: state.lang, t: getT(state.lang) }),
  LangToggle: () => null,
}));
vi.mock("@/components/ThemeProvider", () => ({ ThemeToggle: () => null }));
import Sidebar from "@/components/Sidebar";
import Shell from "@/components/merchandising/MerchandisingShell";
import Destination from "@/components/merchandising/MerchandisingDestination";
const options = {
  monobrand: false,
  channels: [{ id: "1" }, { id: "2" }],
  truncated: false,
};
const render = (config = options) =>
  renderToStaticMarkup(
    createElement(Shell, {
      options: config,
      now: "2026-10-25T10:00:00Z",
      children: createElement(Destination, { screen: "stock" }),
    }),
  );
beforeEach(() => {
  state.lang = "uk";
  state.path = "/stock";
  state.query =
    "period=month&dateFrom=2026-09-01&dateTo=2026-09-30&channelId=2&snapshotId=frozen";
});
describe("localized merchandising shell", () => {
  it.each(["uk", "en"] as const)(
    "renders labeled filters and direct action links in %s",
    (lang) => {
      state.lang = lang;
      const html = render();
      expect(html).toContain(
        lang === "uk" ? "Канал продажів" : "Sales channel",
      );
      expect(html).toContain(lang === "uk" ? "Усі канали" : "All channels");
      expect(html).toContain('value="2" selected=""');
      expect(html).toContain(
        "/repricing?period=month&amp;dateFrom=2026-09-01&amp;dateTo=2026-09-30&amp;channelId=2&amp;snapshotId=frozen",
      );
      expect(html).toContain("/reordering?");
    },
  );
  it("skips brand-level navigation for monobrand deep links", () => {
    state.query += "&groupBy=brand";
    const html = render({ ...options, monobrand: true });
    expect(html).not.toContain("Бренди");
    expect(html).toContain('groupBy=category" aria-current="page"');
  });
  it("offers recovery for invalid links without rendering a default destination", () => {
    state.query = "period=custom&dateFrom=broken&dateTo=2026-09-30";
    const html = render();
    expect(html).toContain('role="alert"');
    expect(html).toContain("Скинути фільтри");
    expect(html).not.toContain("Цей розділ ще готується");
  });
  it("preserves the selected channel when it is missing from available options", () => {
    state.query = state.query.replace("channelId=2", "channelId=external");
    expect(render()).toContain('value="external" selected=""');
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
