import { isValidElement, type ReactNode } from "react";
import { expect, it, vi } from "vitest";
import { BrandAliasesSection } from "@/components/settings/brand-aliases-section/brand-aliases-section";
import { Button } from "@/components/ui/button/button";
function nodes(node: ReactNode): { type: unknown; props: Record<string, any> }[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!isValidElement<{ children?: ReactNode }>(node)) return [];
  return [{ type: node.type, props: node.props }, ...nodes(node.props.children)];
}
function props() { return { aliases: [{ value: "Demo alias", name: "Demo" }], brands: [{ id: "brand", name: "Demo" }], alias: "New spelling", brandId: "brand", lang: "en" as const, canManage: true, busy: false, loading: false, onAliasChange: vi.fn(), onBrandChange: vi.fn(), onSave: vi.fn() }; }
it("submits alias and brand, removes with null, and passes drafts to the parent", () => {
  const value = props(), tree = nodes(BrandAliasesSection(value));
  const preventDefault = vi.fn();
  tree.find(node => node.type === "form")!.props.onSubmit({ preventDefault });
  expect(preventDefault).toHaveBeenCalledOnce();
  expect(value.onSave).toHaveBeenLastCalledWith("New spelling", "brand");
  tree.find(node => node.type === Button && node.props["aria-label"])!.props.onClick();
  expect(value.onSave).toHaveBeenLastCalledWith("Demo alias", null);
  tree.find(node => node.type === "input")!.props.onChange({ target: { value: "  Draft  " } });
  expect(value.onAliasChange).toHaveBeenCalledWith("  Draft  ");
  tree.find(node => node.type === "select")!.props.onChange({ target: { value: "" } });
  expect(value.onBrandChange).toHaveBeenCalledWith("");
});
it("keeps alias information visible to viewers without mutation controls", () => {
  const tree = nodes(BrandAliasesSection({ ...props(), canManage: false }));
  expect(tree.some(node => node.props.translate === "no")).toBe(true);
  expect(tree.some(node => node.type === "form" || node.type === Button)).toBe(false);
});
it.each([{ busy: true }, { loading: true }])("disables mutation controls while %j", state => {
  const tree = nodes(BrandAliasesSection({ ...props(), ...state }));
  const controls = tree.filter(node => [Button, "input", "select"].includes(node.type as never));
  expect(controls).toHaveLength(4);
  expect(controls.every(node => node.props.disabled)).toBe(true);
  expect(tree.find(node => node.type === "input")!.props).toMatchObject({ required: true, maxLength: 200, autoComplete: "off" });
});
