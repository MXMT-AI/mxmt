import { isValidElement, useState, type ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { Choice } from "@/components/ui/choice/choice";
vi.mock("react", async load => ({ ...await load<typeof import("react")>(), useId: () => "choice", useState: vi.fn() }));
function nodes(node: ReactNode): { type: unknown; props: Record<string, any> }[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!isValidElement<{ children?: ReactNode }>(node)) return [];
  return [{ type: node.type, props: node.props }, ...nodes(node.props.children)];
}
const options = Array.from({ length: 110 }, (_, i) => ({ id: String(i), name: `Brand ${i}` }));
function render(search: string, value: string, values = options) {
  vi.mocked(useState).mockReturnValue([search, vi.fn()]);
  const onChange = vi.fn();
  const tree = nodes(Choice({ label: "Brand", value, options: values, all: "All", copy: { optionsSearch: "Search", unassigned: "Unassigned" }, onChange }));
  return { tree, onChange, values: tree.filter(node => node.type === "option").map(node => node.props.value) };
}
beforeEach(() => vi.clearAllMocks());
it("preserves the selected option outside the first hundred matches without duplicates", () => {
  const { values } = render("", "109");
  expect(values.slice(0, 3)).toEqual(["", "109", "0"]);
  expect(values.filter(value => value === "109")).toHaveLength(1);
  expect(values).not.toContain("100");
});
it("keeps the selected option visible while searching case-insensitively", () => {
  const { values } = render("BRAND 1", "50");
  expect(values).toContain("50");
  expect(values).toContain("10");
  expect(values).not.toContain("2");
});
it("ignores an old query once the list shrinks and the search field disappears", () => {
  const { tree, values } = render("no match", "", options.slice(0, 100));
  expect(tree.some(node => node.type === "input")).toBe(false);
  expect(values).toHaveLength(101);
  expect(values).toContain("99");
});
it("retains an externally selected ID and allows clearing it", () => {
  const { tree, values, onChange } = render("", "external", []);
  expect(values).toEqual(["", "external"]);
  tree.find(node => node.type === "select")!.props.onChange({ target: { value: "" } });
  expect(onChange).toHaveBeenCalledWith("");
});
