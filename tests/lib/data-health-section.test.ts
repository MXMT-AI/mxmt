import { isValidElement, useEffect, useState, type ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import DataHealthSection from "@/components/settings/data-health-section/data-health-section";
import DataQualityCard from "@/components/settings/data-quality-card/data-quality-card";
import SalesDriveImportCard from "@/components/settings/sales-drive-import-card/sales-drive-import-card";
import { Text } from "@/components/ui/text/text";
vi.mock("react", async load => ({ ...await load<typeof import("react")>(), useEffect: vi.fn(), useState: vi.fn(), useCallback: (callback: unknown) => callback }));
vi.mock("@/components/settings/data-quality-card/data-quality-card", () => ({ default: () => null }));
vi.mock("@/components/settings/sales-drive-import-card/sales-drive-import-card", () => ({ default: () => null }));
const setRevision = vi.fn(), addEventListener = vi.fn(), removeEventListener = vi.fn();
function nodes(node: ReactNode): { type: unknown; props: Record<string, any> }[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!isValidElement<{ children?: ReactNode }>(node)) return [];
  return [{ type: node.type, props: node.props }, ...nodes(node.props.children)];
}
beforeEach(() => { vi.clearAllMocks(); vi.mocked(useState).mockReturnValue([4, setRevision]); vi.stubGlobal("window", { addEventListener, removeEventListener }); });
afterEach(() => vi.unstubAllGlobals());
it("shares refresh callback between imports and input-change events, then removes the listener", () => {
  const tree = nodes(DataHealthSection({ lang: "en", canManage: true }));
  const cleanup = vi.mocked(useEffect).mock.lastCall![0]();
  const cards = tree.filter(node => node.type === SalesDriveImportCard);
  expect(cards.map(card => card.props.resource)).toEqual(["sync", "inventory", "orders"]);
  const callback = cards[0].props.onCompleted;
  expect(cards.every(card => card.props.generic && card.props.onCompleted === callback)).toBe(true);
  expect(addEventListener).toHaveBeenCalledWith("connector-inputs-changed", callback);
  callback();
  expect(setRevision.mock.lastCall![0](4)).toBe(5);
  expect(tree.find(node => node.type === DataQualityCard)!.props.revision).toBe(4);
  cleanup?.();
  expect(removeEventListener).toHaveBeenCalledWith("connector-inputs-changed", callback);
});
it.each(["uk", "en"] as const)("shows only manual CSV guidance and diagnostics in %s", lang => {
  const tree = nodes(DataHealthSection({ lang, canManage: false, manualUpload: true }));
  expect(tree.some(node => node.type === SalesDriveImportCard)).toBe(false);
  expect(tree.find(node => node.type === DataQualityCard)!.props.canManage).toBe(false);
  expect(tree.find(node => node.type === Text)!.props.children).toContain(lang === "en" ? "activating a new packet" : "активацію нового пакета");
});
it("passes read-only permissions through every automatic import card", () => {
  const cards = nodes(DataHealthSection({ lang: "uk", canManage: false })).filter(node => node.type === SalesDriveImportCard);
  expect(cards).toHaveLength(3);
  expect(cards.every(card => card.props.canManage === false && card.props.lang === "uk")).toBe(true);
});
