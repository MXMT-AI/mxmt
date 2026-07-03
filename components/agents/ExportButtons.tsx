"use client";

import { Download } from "lucide-react";
import type { SheetCell } from "@/lib/promo-sheet";

// Експорт таблиці симуляції в Excel (.xlsx) з живими формулами:
// параметри в шапці (знижка B2 / покриття B2 + множник E2) — зміни і все перерахується.

async function downloadXlsxWithFormulas(values: SheetCell[][], fileName: string, sheetName: string) {
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.aoa_to_sheet(values);
  // рядки що починаються з "=" → живі формули
  for (const addr of Object.keys(ws)) {
    if (addr.startsWith("!")) continue;
    const cell: any = (ws as any)[addr];
    if (cell && typeof cell.v === "string" && cell.v.startsWith("=")) {
      cell.f = cell.v.slice(1);
      cell.t = "n";
      cell.v = 0; // без значення SheetJS викидає клітинку; Excel перерахує при відкритті
    }
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, fileName);
}

export default function ExportButtons({
  title,
  sheetName,
  buildValues,
  disabled,
}: {
  title: string; // назва файлу
  sheetName: string; // назва аркуша
  buildValues: (formulas: boolean) => SheetCell[][];
  disabled?: boolean;
}) {
  const fileName = `${title.replace(/[\\/:*?"<>|]/g, "-")}.xlsx`;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button
        onClick={() => downloadXlsxWithFormulas(buildValues(true), fileName, sheetName)}
        disabled={disabled}
        className="flex items-center gap-1.5 text-[10px] font-mono px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ borderColor: "#00e5c440", background: "#00e5c415", color: "#00e5c4" }}
      >
        <Download size={11} />
        Завантажити Excel
      </button>
      <span className="text-[10px] font-mono text-[var(--subtle)]">
        Формули живі: зміни параметри в шапці файлу — таблиця перерахується
      </span>
    </div>
  );
}
