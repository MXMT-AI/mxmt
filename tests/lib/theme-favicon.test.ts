import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import { ThemeFavicon } from "@/components/theme-favicon/theme-favicon";
import { useThemeSelection } from "@/components/theme-provider/use-theme-selection";
vi.mock("@/components/theme-provider/use-theme-selection", () => ({ useThemeSelection: vi.fn() }));
vi.mock("@/lib/brand-images", () => ({ faviconImages: { light: { src: "/light.png" }, dark: { src: "/dark.png" } } }));
beforeEach(() => vi.clearAllMocks());
function render(mounted: boolean, resolvedTheme: string | undefined) {
  vi.mocked(useThemeSelection).mockReturnValue({ mounted, resolvedTheme, canChangeTheme: mounted, selectedTheme: "system", selectTheme: vi.fn() });
  return renderToStaticMarkup(createElement(ThemeFavicon));
}
it("keeps both system-aware icons before hydration even when a theme is known", () => {
  const html = render(false, "light");
  expect(html.match(/rel="icon"/g)).toHaveLength(2);
  expect(html).toContain('href="/dark.png" media="(prefers-color-scheme: dark)"');
  expect(html).toContain('href="/light.png" media="(prefers-color-scheme: light)"');
});
it.each(["light", "dark"])("uses only the resolved %s icon after hydration", theme => {
  const html = render(true, theme);
  expect(html.match(/rel="icon"/g)).toHaveLength(1);
  expect(html).toContain(`href="/${theme}.png"`);
  expect(html).not.toContain("media=");
});
it.each([undefined, "unknown"])("retains the system fallback for unresolved theme %s", theme => {
  expect(render(true, theme).match(/rel="icon"/g)).toHaveLength(2);
});
