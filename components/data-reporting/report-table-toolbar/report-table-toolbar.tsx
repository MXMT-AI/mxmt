import { useId } from "react";
import { Columns3, Search } from "lucide-react";
import { Button } from "@/components/ui/button/button";
import { controlBase } from "@/components/ui/control-styles/control-styles";
import { DisclosureMenu } from "@/components/ui/disclosure-menu/disclosure-menu";
import type { DataColumnMetadata } from "@/lib/data-table-api";
import { resolveVisibleColumns } from "@/lib/data-reporting-ui";
import { cn } from "@/lib/utils";

const toolbarControl = "inline-flex h-9 items-center gap-2 rounded-lg border border-(--border) bg-(--surface) px-3 text-xs";
const columnAction = "border-0 p-0 font-sans text-xs hover:bg-transparent";
const pageSizes = [25, 50, 100, 200];

export function ReportTableToolbar({
  copy, columns, visibleKeys, searchInput, pageSize, saveState,
  onSearch, onSearchInputChange, onColumnsChange, onToggleColumn, onPageSizeChange,
}: {
  copy: { search: string; searchButton: string; columns: string; visible: string; all: string; defaults: string; rows: string; saving: string; saved: string; saveError: string };
  columns: DataColumnMetadata[];
  visibleKeys: string[];
  searchInput: string;
  pageSize: number;
  saveState: "idle" | "saving" | "saved" | "error";
  onSearch: () => void;
  onSearchInputChange: (value: string) => void;
  onColumnsChange: (columns: string[]) => void;
  onToggleColumn: (key: string) => void;
  onPageSizeChange: (size: number) => void;
}) {
  const searchId = useId();
  const visibleCount = visibleKeys.length;
  const saveMessage = {
    idle: "",
    saving: copy.saving,
    saved: copy.saved,
    error: copy.saveError,
  }[saveState];
  return (
    <div className="p-3 md:p-4 flex flex-col lg:flex-row lg:items-center gap-3 border-b border-(--border) bg-(--row)">
      <form className="flex min-w-0 flex-1 max-w-xl" onSubmit={(event) => {
        event.preventDefault();
        onSearch();
      }}>
        <label className="sr-only" htmlFor={searchId}>{copy.search}</label>
        <div className="relative min-w-0 flex-1">
          <Search size={14} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-(--subtle)" />
          <input id={searchId} value={searchInput} onChange={(event) => onSearchInputChange(event.target.value)}
            placeholder={copy.search}
            className={cn(controlBase, "h-9 w-full rounded-r-none bg-(--input-bg) pl-9 text-sm placeholder:text-(--subtle)")} />
        </div>
        <Button type="submit" className="h-9 rounded-l-none border-l-0 px-3 font-sans rounded-r-lg border-y border-r border-(--border) bg-(--surface2) text-xs font-medium text-(--text) hover:bg-(--input-hover)">
          {copy.searchButton}
        </Button>
      </form>

      <div className="flex flex-wrap items-center gap-2">
        <DisclosureMenu
          className="relative group"
          summaryClassName={cn(toolbarControl, "text-(--text) hover:bg-(--input-hover)")}
          panelClassName="right-0 z-30 mt-2 w-72 max-h-96 overflow-auto rounded-xl p-3 shadow-2xl"
          label={<><Columns3 size={14} aria-hidden="true" />{copy.columns}: {visibleCount} {copy.visible}</>}
        >
          <div className="flex items-center justify-between gap-2 pb-2 mb-2 border-b border-(--border)">
            <Button type="button" onClick={() => onColumnsChange(columns.map((column) => column.key))}
              className={cn(columnAction, "text-accent-cyan hover:text-accent-cyan hover:underline")}>{copy.all}</Button>
            <Button type="button" onClick={() => onColumnsChange(resolveVisibleColumns(columns, []))}
              className={columnAction}>{copy.defaults}</Button>
          </div>
          <div className="space-y-0.5">
            {columns.map((column) => {
              const checked = visibleKeys.includes(column.key);
              return (
                <label key={column.key} className="flex items-start gap-2.5 rounded-md px-2 py-1.5 text-xs text-(--text) hover:bg-(--input-bg) cursor-pointer">
                  <input type="checkbox" checked={checked} disabled={checked && visibleCount === 1}
                    onChange={() => onToggleColumn(column.key)} className="mt-0.5 rounded-sm border-(--border) bg-(--input-bg) text-accent-cyan focus:ring-accent-cyan" />
                  <span className="min-w-0">
                    <span className="block wrap-break-word">{column.label}</span>
                    {column.sourceOnly && <span className="block text-[10px] text-(--subtle)">source</span>}
                  </span>
                </label>
              );
            })}
          </div>
        </DisclosureMenu>

        <label className={cn(toolbarControl, "text-(--muted)")}>
          <span className="sr-only sm:not-sr-only">{copy.rows}</span>
          <select value={pageSize} onChange={(event) => {
            onPageSizeChange(Number(event.target.value));
          }} className="border-0 bg-transparent py-0 pl-0 pr-6 text-xs text-(--text) focus:ring-0">
            {pageSizes.map((size) => <option key={size} value={size}>{size}</option>)}
          </select>
        </label>

        <span aria-live="polite" className={`text-[10px] min-w-24 ${saveState === "error" ? "text-accent-danger" : "text-(--subtle)"}`}>
          {saveMessage}
        </span>
      </div>
    </div>
  );
}
