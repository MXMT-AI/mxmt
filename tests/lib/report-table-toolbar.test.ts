import { isValidElement, type ReactNode } from "react";
import { expect, it, vi } from "vitest";
import { ReportTableToolbar } from "@/components/data-reporting/report-table-toolbar/report-table-toolbar";
import { Button } from "@/components/ui/button/button";

vi.mock("react", async (load) => ({ ...await load<typeof import("react")>(), useId: () => "toolbar-search" }));

function nodes(node: ReactNode): { type: unknown; props: Record<string, any> }[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!isValidElement<{ children?: ReactNode }>(node)) return [];
  return [{ type: node.type, props: node.props }, ...nodes(node.props.children)];
}

it("keeps the last visible column selected and forwards search, column and page-size actions", () => {
  const onSearch = vi.fn();
  const onColumnsChange = vi.fn();
  const onToggleColumn = vi.fn();
  const onPageSizeChange = vi.fn();
  const onSearchInputChange = vi.fn();
  const tree = nodes(ReportTableToolbar({
    copy: { search: "Search", searchButton: "Search", columns: "Columns", visible: "visible", all: "All", defaults: "Defaults", rows: "Rows", saving: "Saving", saved: "Saved", saveError: "Error" },
    columns: [
      { key: "sku", label: "SKU", type: "text", defaultVisible: true },
      { key: "name", label: "Name", type: "text", defaultVisible: false },
    ],
    visibleKeys: ["sku"],
    searchInput: "SKU",
    pageSize: 50,
    saveState: "saved",
    onSearch, onSearchInputChange, onColumnsChange, onToggleColumn, onPageSizeChange,
  }));

  const checkboxes = tree.filter((node) => node.type === "input" && node.props.type === "checkbox");
  expect(checkboxes[0].props.disabled).toBe(true);
  expect(checkboxes[1].props.disabled).toBe(false);
  checkboxes[1].props.onChange();
  expect(onToggleColumn).toHaveBeenCalledWith("name");

  tree.find((node) => node.type === "input" && node.props.id === "toolbar-search")!.props.onChange({ target: { value: "new" } });
  expect(onSearchInputChange).toHaveBeenCalledWith("new");
  const preventDefault = vi.fn();
  tree.find((node) => node.type === "form")!.props.onSubmit({ preventDefault });
  expect(preventDefault).toHaveBeenCalledOnce();
  expect(onSearch).toHaveBeenCalledOnce();

  tree.find((node) => node.type === "select")!.props.onChange({ target: { value: "100" } });
  expect(onPageSizeChange).toHaveBeenCalledWith(100);
  tree.find((node) => node.type === Button && node.props.children === "All")!.props.onClick();
  tree.find((node) => node.type === Button && node.props.children === "Defaults")!.props.onClick();
  expect(onColumnsChange.mock.calls).toEqual([[["sku", "name"]], [["sku"]]]);
});
