import { isValidElement, useEffect, useState, type ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import SettingsTabs from "@/components/settings/settings-tabs/settings-tabs";
import { Button } from "@/components/ui/button/button";
import MerchandisingSettingsCard from "@/components/settings/merchandising-settings-card/merchandising-settings-card";
vi.mock("react", async load => ({ ...await load<typeof import("react")>(), useEffect: vi.fn(), useState: vi.fn() }));
const setTab = vi.fn(), setDirty = vi.fn(), confirm = vi.fn(), replaceState = vi.fn(), addEventListener = vi.fn(), removeEventListener = vi.fn();
function nodes(node: ReactNode): { type: unknown; props: Record<string, any> }[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!isValidElement<{ children?: ReactNode }>(node)) return [];
  return [{ type: node.type, props: node.props }, ...nodes(node.props.children)];
}
function start(tab = "general", dirty = false, canManage = false) {
  vi.mocked(useState).mockReturnValueOnce([tab, setTab]).mockReturnValueOnce([dirty, setDirty]);
  return nodes(SettingsTabs({ lang: "en", generalContent: "General content", canManage }));
}
beforeEach(() => {
  vi.clearAllMocks();
  confirm.mockReturnValue(true);
  vi.stubGlobal("window", { confirm, addEventListener, removeEventListener });
  vi.stubGlobal("location", { href: "https://mxmt.test/en/settings?tab=merchandising&qualityQ=sku#data-quality", search: "?tab=merchandising&qualityQ=sku" });
  vi.stubGlobal("history", { replaceState });
});
afterEach(() => vi.unstubAllGlobals());

it.each(["", "?tab=unknown", "?tab=toString", "?tab=general"])("restores the general tab for %s", search => {
  location.search = search;
  start("agents");
  vi.mocked(useEffect).mock.lastCall![0]();
  expect(setTab).toHaveBeenCalledWith("general");
});
it("restores valid URLs on initial load and popstate and cleans up its listener", () => {
  start();
  const cleanup = vi.mocked(useEffect).mock.lastCall![0]();
  expect(setTab).toHaveBeenLastCalledWith("merchandising");
  location.search = "?tab=agents";
  const listener = addEventListener.mock.calls[0][1];
  listener();
  expect(setTab).toHaveBeenLastCalledWith("agents");
  cleanup?.();
  expect(removeEventListener).toHaveBeenCalledWith("popstate", listener);
});
it("preserves other URL parameters and hash while switching tabs", () => {
  const tree = start();
  const buttons = tree.filter(node => node.type === Button);
  expect(buttons.map(node => node.props["aria-pressed"])).toEqual([true, false, false]);
  buttons[2].props.onClick();
  expect(setTab).toHaveBeenCalledWith("agents");
  const url = replaceState.mock.lastCall![2] as URL;
  expect(url.searchParams.get("tab")).toBe("agents");
  expect(url.searchParams.get("qualityQ")).toBe("sku");
  expect(url.hash).toBe("#data-quality");
});
it("keeps unsaved changes when the user cancels leaving", () => {
  confirm.mockReturnValue(false);
  start("merchandising", true).find(node => node.type === Button)!.props.onClick();
  expect(confirm).toHaveBeenCalledWith("Discard unsaved changes?");
  expect(setTab).not.toHaveBeenCalled();
  expect(setDirty).not.toHaveBeenCalled();
  expect(replaceState).not.toHaveBeenCalled();
});
it("clears dirty state after confirmed navigation but ignores the active tab", () => {
  const buttons = start("merchandising", true).filter(node => node.type === Button);
  buttons[1].props.onClick();
  expect(confirm).not.toHaveBeenCalled();
  buttons[0].props.onClick();
  expect(setDirty).toHaveBeenCalledWith(false);
  expect(setTab).toHaveBeenCalledWith("general");
});
it("passes editing permission and dirty tracking to merchandising settings", () => {
  const child = start("merchandising", false, true).find(node => node.type === MerchandisingSettingsCard)!;
  expect(child.props.canManage).toBe(true);
  child.props.onDirtyChange(true);
  expect(setDirty).toHaveBeenCalledWith(true);
});
