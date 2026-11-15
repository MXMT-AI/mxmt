import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button/button";
import type { ClassifiedSku } from "@/lib/analyst-types";
import { cn } from "@/lib/utils";

import { SKU_FLAGS } from "../sku-flags";

const columns = [
  { uk: "Артикул / Назва", en: "SKU / Name", className: "px-4 text-left" },
  { uk: "Бренд / Категорія", en: "Brand / Category", className: "hidden text-left md:table-cell" },
  { uk: "Залишок", en: "Stock", className: "text-right" },
  { uk: "Продажі 7д / 30д", en: "Sales 7d / 30d", className: "hidden text-right lg:table-cell" },
  { uk: "Днів запасу", en: "Days of stock", className: "hidden text-right lg:table-cell" },
  { uk: "Статус", en: "Status", className: "text-center" },
];

const pageSizes = [20, 50, 100];
const pageButtonClassName = "justify-center bg-(--surface) px-3 py-1.5 font-sans text-xs";
const edgeButtonClassName = "border-transparent px-2 py-1.5 font-sans text-xs";

export function AnalystSkuTable({ skus, locale, page, onPageChange, filters }: {
  skus: ClassifiedSku[];
  locale: "uk" | "en";
  page: number;
  onPageChange: (page: number) => void;
  filters: ReactNode;
}) {
  const uk = locale === "uk";
  const [pageSize, setPageSize] = useState(pageSizes[0]);
  const totalPages = Math.max(1, Math.ceil(skus.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const offset = (currentPage - 1) * pageSize;
  const pagedSkus = skus.slice(offset, offset + pageSize);
  const pageCount = Math.min(5, totalPages);
  const firstPage = Math.max(1, Math.min(currentPage - 2, totalPages - pageCount + 1));

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {filters}
        <label className="ml-auto flex items-center gap-2 text-xs text-(--subtle)">
          {uk ? "На сторінці:" : "Per page:"}
          <select
            value={pageSize}
            onChange={(event) => {
              setPageSize(Number(event.target.value));
              onPageChange(1);
            }}
            className="rounded-lg border border-(--border) bg-(--surface) py-1.5 pr-7 pl-2 text-xs text-(--text)"
          >
            {pageSizes.map((size) => <option key={size} value={size}>{size}</option>)}
          </select>
        </label>
      </div>

      <div className="mb-4 overflow-x-auto rounded-xl border border-(--border) bg-(--surface)">
        <table className="w-full text-sm">
          <thead className="font-mono text-[10px] tracking-widest text-(--subtle) uppercase">
            <tr className="border-b border-(--border)">
              {columns.map((column) => (
                <th key={column.en} scope="col" className={cn("px-3 py-3", column.className)}>
                  {column[locale]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pagedSkus.map((sku) => (
              <tr key={sku.id} className="border-b border-(--border-faint) hover:bg-(--input-bg) transition-colors">
                <td className="px-4 py-3">
                  <div className="text-[10px] font-mono text-accent-cyan">{sku.sku}</div>
                  <div className="text-(--text) text-sm font-medium truncate max-w-48">{sku.name}</div>
                </td>
                <td className="px-3 py-3 hidden md:table-cell">
                  <div className="text-(--muted) text-xs">{sku.brand ?? "—"}</div>
                  <div className="text-(--subtle) text-[11px]">{sku.category}</div>
                </td>
                <td className="px-3 py-3 text-right">
                  <span className="text-(--text) font-mono">{sku.stock}</span>
                  <span className="text-(--subtle) text-[10px] ml-1">{uk ? "шт" : "pcs"}</span>
                </td>
                <td className="px-3 py-3 text-right hidden lg:table-cell">
                  <span className="text-(--text) font-mono">{sku.sold7}</span>
                  <span className="text-(--subtle) mx-1">/</span>
                  <span className="text-(--muted) font-mono">{sku.sold30}</span>
                </td>
                <td className="px-3 py-3 text-right hidden lg:table-cell">
                  <span className={`font-mono ${sku.daysOfStock < sku.leadTime * 1.5 ? "text-accent-negative" : sku.daysOfStock > 90 ? "text-accent-info" : "text-(--muted)"}`}>
                    {sku.daysOfStock >= 9999 ? "—" : sku.daysOfStock}
                  </span>
                </td>
                <td className="px-3 py-3 text-center">
                  <span className="text-lg" role="img" aria-label={SKU_FLAGS[sku.flag][locale]} title={SKU_FLAGS[sku.flag][locale]}>
                    {SKU_FLAGS[sku.flag].emoji}
                  </span>
                </td>
              </tr>
            ))}
            {pagedSkus.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="text-center text-(--subtle) py-8 text-sm">
                  {uk ? "Немає товарів для відображення" : "No items to display"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <nav aria-label={uk ? "Сторінки таблиці SKU" : "SKU table pages"} className="mb-8 flex flex-wrap items-center justify-between gap-2">
          <span className="font-mono text-xs text-(--subtle)">
            {offset + 1}–{Math.min(offset + pageSize, skus.length)} {uk ? "з" : "of"} {skus.length}
          </span>
          <div className="flex flex-wrap items-center gap-1">
            <Button
              onClick={() => onPageChange(1)}
              disabled={currentPage === 1}
              aria-label={uk ? "Перша сторінка" : "First page"}
              className={edgeButtonClassName}
            >
              «
            </Button>
            <Button onClick={() => onPageChange(currentPage - 1)} disabled={currentPage === 1} className={pageButtonClassName}>
              {uk ? "← Назад" : "← Prev"}
            </Button>
            {Array.from({ length: pageCount }, (_, index) => {
              const number = firstPage + index;
              const selected = number === currentPage;
              return (
                <Button
                  key={number}
                  onClick={() => onPageChange(number)}
                  aria-current={selected ? "page" : undefined}
                  className={cn(
                    "size-8 justify-center border-transparent p-0 font-sans text-xs",
                    selected && "border-accent-cyan/30 bg-accent-cyan/10 text-accent-cyan",
                  )}
                >
                  {number}
                </Button>
              );
            })}
            <Button onClick={() => onPageChange(currentPage + 1)} disabled={currentPage === totalPages} className={pageButtonClassName}>
              {uk ? "Далі →" : "Next →"}
            </Button>
            <Button
              onClick={() => onPageChange(totalPages)}
              disabled={currentPage === totalPages}
              aria-label={uk ? "Остання сторінка" : "Last page"}
              className={edgeButtonClassName}
            >
              »
            </Button>
          </div>
        </nav>
      )}
    </>
  );
}
