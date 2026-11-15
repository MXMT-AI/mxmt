import { beforeEach, expect, it, vi } from "vitest";
import { useThemeSelection } from "@/components/theme-provider/use-theme-selection";

const state = vi.hoisted(() => ({
  server: false,
  theme: undefined as string | undefined,
  forcedTheme: undefined as string | undefined,
  resolvedTheme: "dark",
  setTheme: vi.fn(),
}));

vi.mock("next-themes", () => ({ useTheme: () => state }));
vi.mock("react", async (load) => ({
  ...await load<typeof import("react")>(),
  useSyncExternalStore: (_subscribe: unknown, client: () => boolean, server: () => boolean) => state.server ? server() : client(),
}));

beforeEach(() => {
  state.server = false;
  state.theme = undefined;
  state.forcedTheme = undefined;
  state.setTheme.mockClear();
});

it("keeps the server selection neutral and prevents changes before hydration", () => {
  state.server = true;
  state.theme = "light";
  const selection = useThemeSelection();
  expect(selection.mounted).toBe(false);
  expect(selection.selectedTheme).toBeUndefined();
  expect(selection.canChangeTheme).toBe(false);
  selection.selectTheme("dark");
  expect(state.setTheme).not.toHaveBeenCalled();
});

it.each(["light", "dark", "system"] as const)("selects %s without replacing system with the resolved theme", (theme) => {
  state.theme = theme;
  const selection = useThemeSelection();
  expect(selection.selectedTheme).toBe(theme);
  expect(selection.canChangeTheme).toBe(true);
  selection.selectTheme(theme);
  expect(state.setTheme).toHaveBeenCalledWith(theme);
});

it("defaults to system when no preference is stored", () => {
  expect(useThemeSelection().selectedTheme).toBe("system");
});

it("gives the forced theme priority and prevents changes", () => {
  state.theme = "light";
  state.forcedTheme = "dark";
  const selection = useThemeSelection();
  expect(selection.selectedTheme).toBe("dark");
  expect(selection.canChangeTheme).toBe(false);
  selection.selectTheme("system");
  expect(state.setTheme).not.toHaveBeenCalled();
});
