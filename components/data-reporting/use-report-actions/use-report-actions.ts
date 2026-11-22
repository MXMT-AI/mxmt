"use client";

import { useRef, useState } from "react";
import type { Locale } from "@/i18n/routing";
import { isRecord } from "@/lib/api-contracts";
import { validateReportPeriod } from "@/lib/data-reporting-ui";
import { postDataReportingAction } from "@/lib/client/data-reporting-request";
import { refreshSelectedSheetsReports, SheetsReportingRefreshError, sheetsRefreshMessage } from "@/lib/client/sheets-reporting";
import { dataReportingUseReportActionsMessages as englishCopy } from "@/messages/en.json";
import { dataReportingUseReportActionsMessages as ukrainianCopy } from "@/messages/uk.json";

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
            messages.push(lang === "uk" ? ukrainianCopy.selectAnApprovedGoogleSheets : englishCopy.selectAnApprovedGoogleSheets);
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
          messages.push((lang === "uk" ? ukrainianCopy.dataReportsTabCalculation : englishCopy.dataReportsTabCalculation) + (error instanceof Error ? error.message : englishCopy.calculationFailed));
        }
      }
      setActionError(messages.length ? messages.join(" ") : null);
      onComplete();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : englishCopy.actionFailed);
    } finally {
      inFlight.current = false;
      onReload();
      setAction(null);
    }
  }

  return { action, actionError, reportsReady, periodError, setActionError, setPeriodError, runAction };
}
