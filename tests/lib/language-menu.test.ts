import { isValidElement, useRef, type ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { LanguageMenu } from "@/components/language-provider/language-menu/language-menu";
import { DisclosureMenu } from "@/components/ui/disclosure-menu/disclosure-menu";
import { Button } from "@/components/ui/button/button";

const state = vi.hoisted(() => ({ locale: "uk" as "uk" | "en", replace: vi.fn() }));
vi.mock("next-intl", () => ({ useLocale: () => state.locale }));
vi.mock("@/i18n/navigation", () => ({
  usePathname: () => "/docs",
  useRouter: () => ({ replace: state.replace }),
}));
vi.mock("react", async (load) => ({ ...await load<typeof import("react")>(), useRef: vi.fn() }));

function nodes(node: ReactNode): { type: unknown; props: Record<string, any> }[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!isValidElement<{ children?: ReactNode }>(node)) return [];
  return [{ type: node.type, props: node.props }, ...nodes(node.props.children)];
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("window", { location: { search: "?tab=google-sheets&filter=all", hash: "#sheets-mapping" } });
});
afterEach(() => vi.unstubAllGlobals());

it.each(["uk", "en"] as const)("preserves the full URL when selecting another locale from %s", (locale) => {
  state.locale = locale;
  const menu = LanguageMenu({ label: "Change language", title: "Language" });
  const choices = nodes(menu).filter((node) => node.type === Button);
  expect(choices.map((node) => [node.props.lang, node.props["aria-pressed"]])).toEqual([
    ["en", locale === "en"], ["uk", locale === "uk"],
  ]);
  choices.find((node) => node.props.lang !== locale)!.props.onClick();
  expect(state.replace).toHaveBeenCalledWith("/docs?tab=google-sheets&filter=all#sheets-mapping", {
    locale: locale === "uk" ? "en" : "uk", scroll: false,
  });
  state.replace.mockClear();
  choices.find((node) => node.props.lang === locale)!.props.onClick();
  expect(state.replace).not.toHaveBeenCalled();
  expect(menu.props.closeOnSelect).toBe(true);
});

it("closes an opted-in menu after a button selection and restores focus on Escape", () => {
  const menuElement = { open: true };
  const focus = vi.fn();
  vi.mocked(useRef).mockReturnValueOnce({ current: menuElement }).mockReturnValueOnce({ current: { focus } });
  const disclosure = DisclosureMenu({ label: "Language", className: "", summaryClassName: "", panelClassName: "", closeOnSelect: true, children: null });
  class ClickTarget {
    closest(selector: string) { return selector.includes("button") ? this : null; }
  }
  vi.stubGlobal("Element", ClickTarget);
  const panel = nodes(disclosure).find((node) => node.type === "div")!;
  panel.props.onClick({ target: new ClickTarget() });
  expect(menuElement.open).toBe(false);
  expect(focus).toHaveBeenCalledOnce();

  menuElement.open = true;
  disclosure.props.onKeyDown({ key: "Escape", currentTarget: menuElement });
  expect(menuElement.open).toBe(false);
  expect(focus).toHaveBeenCalledTimes(2);
});
