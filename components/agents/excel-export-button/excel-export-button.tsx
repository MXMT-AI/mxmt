"use client";

import { useId } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button/button";
import { useXlsxExport } from "@/components/ui/use-xlsx-export/use-xlsx-export";
import { buildXlsxWorkbook, type SheetCell } from "@/lib/xlsx-workbook";
import { agentsExcelExportButtonMessages as ukrainianCopy } from "@/messages/uk.json";

export function ExcelExportButton({ title, sheetName, buildValues, disabled }: {
  title: string;
  sheetName: string;
  buildValues: () => SheetCell[][];
  disabled?: boolean;
}) {
  const hintId = useId();
  const { exporting, error, exportExcel } = useXlsxExport({
    title, disabled,
    buildWorkbook: xlsx => buildXlsxWorkbook(xlsx, buildValues(), sheetName),
  });

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          onClick={exportExcel}
          disabled={disabled || exporting}
          aria-describedby={hintId}
          className="border-accent-fill/25 bg-accent-fill/8 px-3 py-1.5 text-accent-cyan hover:bg-accent-fill/15 hover:text-accent-cyan"
        >
          <Download size={11} aria-hidden="true" />
          {exporting ? ukrainianCopy.готуємоExcel : ukrainianCopy.завантажитиExcel}
        </Button>
        <span id={hintId} className="text-[10px] font-mono text-(--subtle)">{ukrainianCopy.змінітьПараметриВШапціФайлу}</span>
      </div>
      {error && <p role="alert" className="text-xs text-accent-danger">{ukrainianCopy.неВдалосяЗавантажитиExcelСпробуйте}</p>}
    </div>
  );
}
