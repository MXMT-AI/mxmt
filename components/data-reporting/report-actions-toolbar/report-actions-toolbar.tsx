import { Calculator, LoaderCircle, RefreshCw, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button/button";
import type { Locale } from "@/i18n/routing";
import { rawImportIsLive } from "@/lib/data-import-policy";
import { cn } from "@/lib/utils";
import type { ReportAction } from "../use-report-actions/use-report-actions";
import type { DataStatus } from "../use-report-status/use-report-status";

const buttonClassName = "gap-2 px-3 py-2 font-sans text-sm";
const surfaceClassName = "bg-(--surface) hover:bg-(--input-hover)";
const spinner = <LoaderCircle size={14} className="motion-safe:animate-spin" aria-hidden="true" />;

export function ReportActionsToolbar({ lang, copy, loading, action, status, canCalculate, canImport, canRefreshReports, onRefresh, onAction }: {
  lang: Locale;
  copy: { calculate: string; calculating: string; import: string; importing: string };
  loading: boolean;
  action: ReportAction | null;
  status: Pick<DataStatus, "activeImport" | "connection" | "latestImport"> | null;
  canCalculate: boolean;
  canImport: boolean;
  canRefreshReports: boolean;
  onRefresh: () => void;
  onAction: (action: ReportAction) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button onClick={onRefresh} disabled={loading} className={cn(buttonClassName, surfaceClassName)}>
        <RefreshCw size={14} className={loading ? "motion-safe:animate-spin" : undefined} aria-hidden="true" />
        {lang === "uk" ? "Оновити перегляд" : "Refresh view"}
      </Button>
      {canCalculate && (
        <Button onClick={() => onAction("calculate")} disabled={action !== null || !status?.activeImport}
          className={cn(buttonClassName, surfaceClassName, "text-(--text)")}>
          {action === "calculate" ? spinner : <Calculator size={14} aria-hidden="true" />}
          {action === "calculate" ? copy.calculating : copy.calculate}
        </Button>
      )}
      {canImport && (
        <>
          <Button onClick={() => onAction("projection")} disabled={action !== null || !canRefreshReports}
            className={cn(buttonClassName, "text-(--text) focus-visible:outline-solid focus-visible:outline-2")}>
            {action === "projection" ? spinner : <RefreshCw size={14} aria-hidden="true" />}
            {lang === "uk" ? "Оновити MVP-звіти" : "Refresh MVP reports"}
          </Button>
          <Button onClick={() => onAction("import")} disabled={action !== null || !status?.connection || rawImportIsLive(status?.latestImport ?? null)}
            variant="accent" className={cn(buttonClassName, "inline-flex items-center")}>
            {action === "import" ? spinner : <UploadCloud size={14} aria-hidden="true" />}
            {action === "import" ? copy.importing : copy.import}
          </Button>
        </>
      )}
    </div>
  );
}
