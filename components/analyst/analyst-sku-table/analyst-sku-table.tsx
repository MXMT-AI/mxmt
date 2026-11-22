import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button/button";
import { controlBase } from "@/components/ui/control-styles/control-styles";
import { Field } from "@/components/ui/field/field";
import { panel } from "@/components/ui/panel/panel-styles";
import type { ClassifiedSku } from "@/lib/analyst-types";
import { cn } from "@/lib/utils";

import { SKU_FLAGS } from "../sku-flags";
import { analystAnalystSkuTableMessages as englishCopy } from "@/messages/en.json";
import { analystAnalystSkuTableMessages as ukrainianCopy } from "@/messages/uk.json";

const columns = [
  { uk: ukrainianCopy.enSKUName, en: englishCopy.enSKUName, className: "px-4 text-left" },
  { uk: ukrainianCopy.enBrandCategory, en: englishCopy.enBrandCategory, className: "hidden text-left md:table-cell" },
  { uk: ukrainianCopy.enStock, en: englishCopy.enStock, className: "text-right" },
  { uk: ukrainianCopy.enSales7d30d, en: englishCopy.enSales7d30d, className: "hidden text-right lg:table-cell" },
  { uk: ukrainianCopy.enDaysOfStock, en: englishCopy.enDaysOfStock, className: "hidden text-right lg:table-cell" },
  { uk: ukrainianCopy.enStatus, en: englishCopy.enStatus, className: "text-center" },
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
        <Field label={uk ? ukrainianCopy.labelPerPage : englishCopy.labelPerPage} className="ml-auto flex-row items-center gap-2 text-(--subtle)">
          <select
            value={pageSize}
            onChange={(event) => {
              setPageSize(Number(event.target.value));
              onPageChange(1);
            }}
            className={cn(controlBase, "bg-(--surface) py-1.5 pr-7 pl-2 text-xs")}
          >
            {pageSizes.map((size) => <option key={size} value={size}>{size}</option>)}
          </select>
        </Field>
      </div>

      <div className={cn(panel, "mb-4 overflow-x-auto")}>
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
                  <span className="text-(--subtle) text-[10px] ml-1">{uk ? ukrainianCopy.pcs : englishCopy.pcs}</span>
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
                  {uk ? ukrainianCopy.noItemsToDisplay : englishCopy.noItemsToDisplay}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <nav aria-label={uk ? ukrainianCopy.ariaLabelSKUTablePages : englishCopy.ariaLabelSKUTablePages} className="mb-8 flex flex-wrap items-center justify-between gap-2">
          <span className="font-mono text-xs text-(--subtle)">
            {offset + 1}–{Math.min(offset + pageSize, skus.length)} {uk ? ukrainianCopy.of : englishCopy.of} {skus.length}
          </span>
          <div className="flex flex-wrap items-center gap-1">
            <Button
              onClick={() => onPageChange(1)}
              disabled={currentPage === 1}
              aria-label={uk ? ukrainianCopy.ariaLabelFirstPage : englishCopy.ariaLabelFirstPage}
              className={edgeButtonClassName}
            >
              «
            </Button>
            <Button onClick={() => onPageChange(currentPage - 1)} disabled={currentPage === 1} className={pageButtonClassName}>
              {uk ? ukrainianCopy.prev : englishCopy.prev}
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
              {uk ? ukrainianCopy.next : englishCopy.next}
            </Button>
            <Button
              onClick={() => onPageChange(totalPages)}
              disabled={currentPage === totalPages}
              aria-label={uk ? ukrainianCopy.ariaLabelLastPage : englishCopy.ariaLabelLastPage}
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
