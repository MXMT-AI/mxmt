"use client";

import { useRef, useState } from "react";
import type { WorkBook } from "xlsx";

export function useXlsxExport({ title, buildWorkbook, disabled = false }: {
  title: string | (() => string);
  buildWorkbook: (xlsx: typeof import("xlsx")) => WorkBook;
  disabled?: boolean;
}) {
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState(false);
  const inFlight = useRef(false);

  async function exportExcel() {
    if (disabled || inFlight.current) return;
    inFlight.current = true;
    setExporting(true);
    setError(false);
    try {
      const xlsx = await import("xlsx");
      const workbook = buildWorkbook(xlsx);
      const name = typeof title === "function" ? title() : title;
      const fileName = name.replace(/[\\/:*?"<>|]/g, "-") + ".xlsx";
      await xlsx.writeFile(workbook, fileName);
    } catch {
      setError(true);
    } finally {
      inFlight.current = false;
      setExporting(false);
    }
  }

  return { exporting, error, exportExcel };
}
