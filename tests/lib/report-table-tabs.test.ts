import { expect, it, vi } from "vitest";
import { DATA_TABLE_KEYS } from "@/lib/data-table-preferences";
import { ReportTableTabs, reportTablePanelId, reportTabId } from "@/components/data-reporting/report-table-tabs/report-table-tabs";

type Tab = { props: { id: string; tabIndex: number; "aria-selected": boolean; "aria-controls": string; onClick: () => void; onKeyDown: (event: any) => void } };
function start() {
  const onSelect = vi.fn();
  const tree = ReportTableTabs({ activeTab: "article_report", label: "Data tables", onSelect });
  return { onSelect, tabs: tree.props.children.props.children as Tab[] };
}

it("uses the shared table order with one keyboard tab stop and matching panel references", () => {
  const { tabs, onSelect } = start();
  expect(tabs.map(tab => tab.props.id)).toEqual(DATA_TABLE_KEYS.map(reportTabId));
  expect(tabs.map(tab => tab.props.tabIndex)).toEqual([-1, -1, 0, -1, -1]);
  expect(tabs.map(tab => tab.props["aria-selected"])).toEqual([false, false, true, false, false]);
  expect(tabs.every(tab => tab.props["aria-controls"] === reportTablePanelId)).toBe(true);
  for (const tab of tabs) tab.props.onClick();
  expect(onSelect.mock.calls).toEqual(DATA_TABLE_KEYS.map(key => [key]));
});

it.each([
  { index: 0, key: "ArrowLeft", target: 4 },
  { index: 4, key: "ArrowRight", target: 0 },
  { index: 2, key: "ArrowLeft", target: 1 },
  { index: 2, key: "ArrowRight", target: 3 },
  { index: 2, key: "Home", target: 0 },
  { index: 2, key: "End", target: 4 },
])("moves focus and selection for $key at $index", ({ index, key, target }) => {
  const { tabs, onSelect } = start();
  const elements = DATA_TABLE_KEYS.map(() => ({ focus: vi.fn() }));
  const preventDefault = vi.fn();
  tabs[index].props.onKeyDown({ key, preventDefault, currentTarget: { parentElement: { querySelectorAll: () => elements } } });
  expect(preventDefault).toHaveBeenCalledOnce();
  expect(elements[target].focus).toHaveBeenCalledOnce();
  expect(onSelect).toHaveBeenCalledExactlyOnceWith(DATA_TABLE_KEYS[target]);
});

it("leaves unrelated keys to the browser", () => {
  const { tabs, onSelect } = start();
  const preventDefault = vi.fn();
  tabs[0].props.onKeyDown({ key: "Tab", preventDefault });
  expect(preventDefault).not.toHaveBeenCalled();
  expect(onSelect).not.toHaveBeenCalled();
});
