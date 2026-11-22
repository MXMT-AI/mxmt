import type { ReportingSourceChoice } from "./reporting-source-contract";
import { reportingReadinessCopyMessages as englishCopy } from "@/messages/en.json";
import { reportingReadinessCopyMessages as ukrainianCopy } from "@/messages/uk.json";
export type ReportingHelp = { message: string; href: string; action: string };
export function reportingErrorHelp(
  code: string,
  lang: "uk" | "en",
): ReportingHelp {
  const uk = lang === "uk";
  const settings = {
    href: "/settings",
    action: uk ? ukrainianCopy.actionOpenSettings : englishCopy.actionOpenSettings,
  };
  const data = {
    href: "/data-reporting?provider=sheets",
    action: uk ? ukrainianCopy.actionOpenDataReports : englishCopy.actionOpenDataReports,
  };
  if (
    [
      "SALESDRIVE_NOT_CONFIGURED",
      "CONNECTOR_SOURCE_NOT_FOUND",
      "SHEETS_SOURCE_SELECTION_REQUIRED",
    ].includes(code)
  )
    return {
      ...settings,
      message: uk
        ? ukrainianCopy.messageTheReportingSourceIsNot
        : englishCopy.messageTheReportingSourceIsNot,
    };
  if (code === "PUBLICATION_INPUT_LIMIT")
    return {
      ...settings,
      message: uk
        ? ukrainianCopy.messageTheSnapshotExceedsTheData
        : englishCopy.messageTheSnapshotExceedsTheData,
    };
  if (code === "PUBLISHED_DATE_INCOMPLETE")
    return {
      ...settings,
      message: uk
        ? ukrainianCopy.messageVerifiedSalesOrInventoryIs
        : englishCopy.messageVerifiedSalesOrInventoryIs,
    };
  if (code === "PUBLICATION_CONFLICT" || code === "PUBLISHED_SOURCE_CHANGED")
    return {
      ...settings,
      message: uk
        ? ukrainianCopy.messageTheSourceChangedWhileThe
        : englishCopy.messageTheSourceChangedWhileThe,
    };
  if (code === "SHEETS_MAPPING_REQUIRED")
    return {
      ...settings,
      message: uk
        ? ukrainianCopy.messageGoogleSheetsMappingNeedsApproval
        : englishCopy.messageGoogleSheetsMappingNeedsApproval,
    };
  if (code === "SHEETS_IMPORT_REQUIRED")
    return {
      ...data,
      message: uk
        ? ukrainianCopy.messageGoogleSheetsHasNotBeen
        : englishCopy.messageGoogleSheetsHasNotBeen,
    };
  if (
    [
      "SALES_IMPORT_NOT_READY",
      "DAILY_IMPORT_NOT_READY",
      "CONNECTOR_CHECK_REQUIRED",
    ].includes(code)
  )
    return {
      ...settings,
      message: uk
        ? ukrainianCopy.messageTheSourceIsNotReady
        : englishCopy.messageTheSourceIsNotReady,
    };
  if (
    [
      "SCREEN_SELECTION_MISMATCH",
      "CONNECTOR_SOURCE_CHANGED",
      "SOURCE_SELECTION_CHANGED",
    ].includes(code)
  )
    return {
      ...settings,
      message: uk
        ? ukrainianCopy.messageTheSourceOrPeriodSelection
        : englishCopy.messageTheSourceOrPeriodSelection,
    };
  return {
    ...settings,
    message: uk
      ? ukrainianCopy.messageTheReportCouldNotBe
      : englishCopy.messageTheReportCouldNotBe,
  };
}
export function reportingSourceHelp(
  source: ReportingSourceChoice | undefined,
  lang: "uk" | "en",
): ReportingHelp {
  if (!source)
    return reportingErrorHelp("SHEETS_SOURCE_SELECTION_REQUIRED", lang);
  if (source.readiness === "MAPPING_REQUIRED")
    return reportingErrorHelp("SHEETS_MAPPING_REQUIRED", lang);
  if (source.readiness === "CONNECTION_CHECK_REQUIRED")
    return reportingErrorHelp("CONNECTOR_CHECK_REQUIRED", lang);
  if (source.readiness === "IMPORT_REQUIRED")
    return reportingErrorHelp(
      source.provider === "sheets"
        ? "SHEETS_IMPORT_REQUIRED"
        : "SALES_IMPORT_NOT_READY",
      lang,
    );
  return {
    message:
      lang === "uk"
        ? ukrainianCopy.messageSourceInputsAreReadyFor
        : englishCopy.messageSourceInputsAreReadyFor,
    href: "/overview",
    action: lang === "uk" ? ukrainianCopy.actionOpenOverview : englishCopy.actionOpenOverview,
  };
}
