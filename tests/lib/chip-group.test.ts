import { createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { Chip } from "@/components/ui/chip/chip";
import { ChipGroup } from "@/components/ui/chip-group/chip-group";

function chips(node: ReactNode): { label: string; active: boolean; onClick: () => void }[] {
  if (Array.isArray(node)) return node.flatMap(chips);
  if (!isValidElement<{ children?: ReactNode }>(node)) return [];
  if (node.type === Chip) return [node.props as ReturnType<typeof chips>[number]];
  return chips(node.props.children);
}
const options = [{ v: "shop", l: "Shop" }, { v: "web", l: "Website" }];
it("replaces a single selection and keeps selecting the active option idempotent", () => {
  const onChange = vi.fn();
  const choices = chips(ChipGroup({ options, value: "shop", onChange }));
  expect(choices.map(choice => choice.active)).toEqual([true, false]);
  choices[1].onClick();
  expect(onChange).toHaveBeenLastCalledWith("web");
  choices[0].onClick();
  expect(onChange).toHaveBeenLastCalledWith("shop");
});
it("adds and removes multiple selections without mutating the original array", () => {
  const onChange = vi.fn(), value = ["shop"];
  const choices = chips(ChipGroup({ options, multiple: true, value, onChange }));
  choices[1].onClick();
  expect(onChange).toHaveBeenLastCalledWith(["shop", "web"]);
  choices[0].onClick();
  expect(onChange).toHaveBeenLastCalledWith([]);
  expect(value).toEqual(["shop"]);
});
it.each([false, true])("exposes active=%s without submitting a surrounding form", active => {
  const html = renderToStaticMarkup(createElement(Chip, { label: "Shop", active, onClick: vi.fn() }));
  expect(html).toContain(`aria-pressed="${active}"`);
  expect(html).toContain('type="button"');
});
