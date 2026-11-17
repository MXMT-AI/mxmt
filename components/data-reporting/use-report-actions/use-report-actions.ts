"use client";

import { useRef, useState } from "react";
import type { Locale } from "@/i18n/routing";
import { isRecord } from "@/lib/api-contracts";
import { validateReportPeriod } from "@/lib/data-reporting-ui";
import { postDataReportingAction } from "@/lib/client/data-reporting-request";
import { refreshSelectedSheetsReports, SheetsReportingRefreshError, sheetsRefreshMessage } from "@/lib/client/sheets-reporting";

export type ReportAction = "import" | "calculate" | "projection";

export function useReportActions({ dateFrom, dateTo, canImport, lang, periodCopy, onComplete, onReload }: {
  dateFrom: string;
  dateTo: string;
  canImport: boolean;
  lang: Locale;
  periodCopy: { periodRequired: string; periodReversed: string };
  onComplete: () => void;
  onReload: () => void;
}) {
  const [action, setAction] = useState<ReportAction | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reportsReady, setReportsReady] = useState(false);
  const [periodError, setPeriodError] = useState<string | null>(null);
  const inFlight = useRef(false);

  async function runAction(kind: ReportAction) {
    if (inFlight.current) return;
    const issue = validateReportPeriod(dateFrom, dateTo);
    if (issue && kind !== "projection") {
      setPeriodError(issue === "required" ? periodCopy.periodRequired : periodCopy.periodReversed);
      return;
    }
    inFlight.current = true;
    setAction(kind);
    setActionError(null);
    setReportsReady(false);
    setPeriodError(null);
    try {
      let importedRunId: string | undefined;
      if (kind === "import") {
        const body = await postDataReportingAction("/api/data/import", { dateFrom, dateTo, calculate: false }, lang);
        const imported = isRecord(body) ? body.import : null;
        importedRunId = isRecord(imported) && typeof imported.importRunId === "string" ? imported.importRunId : undefined;
      }
      const messages: string[] = [];
      if (canImport) {
        try {
          const projected = await refreshSelectedSheetsReports(importedRunId);
          if (projected.state === "READY") {
            setReportsReady(true);
            window.dispatchEvent(new Event("connector-connection-changed"));
          }
          if (projected.state === "NOT_SELECTED" && kind === "projection") {
            messages.push(lang === "uk" ? "Виберіть погоджене джерело Google Sheets у налаштуваннях." : "Select an approved Google Sheets reporting source in Settings.");
          }
        } catch (error) {
          const requestId = error instanceof SheetsReportingRefreshError ? error.requestId : undefined;
          messages.push(sheetsRefreshMessage(error instanceof SheetsReportingRefreshError ? error.code : "SHEETS_REFRESH_FAILED", lang) + (requestId ? ` (Request ID: ${requestId})` : ""));
        }
      }
      if (kind !== "projection") {
        try {
          await postDataReportingAction("/api/data/calculate", { dateFrom, dateTo, ...(importedRunId ? { importRunId: importedRunId } : {}) }, lang);
        } catch (error) {
          messages.push((lang === "uk" ? "Розрахунок вкладок «Дані та звіти»: " : "Data & Reports tab calculation: ") + (error instanceof Error ? error.message : "Calculation failed"));
        }
      }
      setActionError(messages.length ? messages.join(" ") : null);
      onComplete();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Action failed");
    } finally {
      inFlight.current = false;
      onReload();
      setAction(null);
    }
  }

  return { action, actionError, reportsReady, periodError, setActionError, setPeriodError, runAction };
}
