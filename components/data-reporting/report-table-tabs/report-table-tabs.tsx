import type { KeyboardEvent } from "react";
import { Button } from "@/components/ui/button/button";
import { DATA_TABLE_KEYS, type DataTableKey } from "@/lib/data-table-preferences";
import { cn } from "@/lib/utils";
import { dataReportingReportTableTabsMessages as englishCopy } from "@/messages/en.json";

const labels = {
  product_yml: englishCopy.productYml,
  zavod_api: "ZAVOD_API",
  article_report: englishCopy.articleReport,
  by_brand: englishCopy.byBrand,
  by_category: englishCopy.byCategory,
} satisfies Record<DataTableKey, string>;

export const reportTablePanelId = "data-table-panel";
export const reportTabId = (key: DataTableKey) => `tab-${key}`;

export function ReportTableTabs({ activeTab, label, onSelect }: {
  activeTab: DataTableKey;
  label: string;
  onSelect: (key: DataTableKey) => void;
}) {
  function navigate(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number;
    switch (event.key) {
      case "ArrowLeft": next = (index + DATA_TABLE_KEYS.length - 1) % DATA_TABLE_KEYS.length; break;
      case "ArrowRight": next = (index + 1) % DATA_TABLE_KEYS.length; break;
      case "Home": next = 0; break;
      case "End": next = DATA_TABLE_KEYS.length - 1; break;
      default: return;
    }
    event.preventDefault();
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
    onSelect(DATA_TABLE_KEYS[next]);
  }

  return (
    <div className="overflow-x-auto border-b border-(--border)">
      <div role="tablist" aria-label={label} className="flex min-w-max px-2 pt-2">
        {DATA_TABLE_KEYS.map((key, index) => (
          <Button key={key} id={reportTabId(key)} role="tab" aria-selected={activeTab === key}
            aria-controls={reportTablePanelId} tabIndex={activeTab === key ? 0 : -1}
            onClick={() => onSelect(key)} onKeyDown={event => navigate(event, index)}
            className={cn("rounded-none border-x-0 border-t-0 px-4 py-3 border-b-2 text-xs font-mono font-semibold tracking-wide",
              activeTab === key ? "border-accent-cyan text-accent-cyan" : "border-transparent text-(--muted) hover:text-(--text)")}>
            {labels[key]}
          </Button>
        ))}
      </div>
    </div>
  );
}
