import { isValidElement, type ReactNode } from "react";
import { expect, it, vi } from "vitest";
import { DataQualityProducts } from "@/components/settings/data-quality-products/data-quality-products";
import { DataQualityProductCard } from "@/components/settings/data-quality-product-card/data-quality-product-card";
import { Button } from "@/components/ui/button/button";
import { Heading } from "@/components/ui/heading/heading";
import { Text } from "@/components/ui/text/text";
function nodes(node: ReactNode): { type: unknown; props: Record<string, any> }[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!isValidElement<{ children?: ReactNode }>(node)) return [];
  return [{ type: node.type, props: node.props }, ...nodes(node.props.children)];
}
const props = () => ({ rows: [], pagination: { page: 1, pageSize: 10, totalRows: 21 }, page: 1, code: "", query: "draft", lang: "en" as const, canManage: true, disabled: false, onQueryChange: vi.fn(), onSearch: vi.fn(), onPage: vi.fn(), onKindChange: vi.fn() });
it("keeps draft editing, explicit search and paging as separate callbacks", () => {
  const value = props(), tree = nodes(DataQualityProducts(value));
  tree.find(node => node.type === "input")!.props.onChange({ target: { value: "new draft" } });
  expect(value.onQueryChange).toHaveBeenCalledWith("new draft");
  expect(value.onSearch).not.toHaveBeenCalled();
  const preventDefault = vi.fn();
  tree.find(node => node.type === "form")!.props.onSubmit({ preventDefault });
  expect(preventDefault).toHaveBeenCalledOnce();
  expect(value.onSearch).toHaveBeenCalledOnce();
  tree.find(node => node.type === Button && node.props.children === "Next")!.props.onClick();
  expect(value.onPage).toHaveBeenCalledWith(2);
  expect(value.onSearch).toHaveBeenCalledOnce();
});
it("uses server page size and disables boundary navigation", () => {
  const first = nodes(DataQualityProducts(props()));
  expect(first.find(node => node.type === Button && node.props.children === "Previous")!.props.disabled).toBe(true);
  expect(first.find(node => node.type === Button && node.props.children === "Next")!.props.disabled).toBe(false);
  const last = nodes(DataQualityProducts({ ...props(), page: 3 }));
  expect(last.find(node => node.type === Button && node.props.children === "Next")!.props.disabled).toBe(true);
  const count = last.find(node => node.type === "span")!.props.children;
  expect(count).toEqual(["3", " / ", "3"]);
});
it("preserves the focus target and localized empty and issue labels", () => {
  const headingRef = { current: null };
  const tree = nodes(DataQualityProducts({ ...props(), lang: "uk", code: "MISSING_BRAND", headingRef }));
  const heading = tree.find(node => node.type === Heading)!.props;
  expect(heading).toMatchObject({ tabIndex: -1, ref: headingRef });
  expect(heading.children).toBe("Проблема: Не заповнено бренд");
  expect(tree.find(node => node.type === Text)!.props.children).toContain("Товарів за цією проблемою");
});
it("passes permissions and mutation callbacks to rows and disables actions during loading", () => {
  const value = props();
  const row = { id: "p", sku: "sku", name: "Demo", productKind: "SERVICE", brandKey: "Demo", issues: [], ageReference: { date: null, basis: "UNKNOWN" }, sourceId: "s", observedAt: null, importRunId: "i", sourceRecordKey: "k" };
  const tree = nodes(DataQualityProducts({ ...value, rows: [row], canManage: false, disabled: true }));
  expect(tree.find(node => node.type === DataQualityProductCard)!.props).toMatchObject({ row, canManage: false, disabled: true, onKindChange: value.onKindChange });
  expect(tree.filter(node => node.type === Button).every(node => node.props.disabled)).toBe(true);
});
