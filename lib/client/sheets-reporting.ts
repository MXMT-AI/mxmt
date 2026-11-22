import { apiFetch } from "../fetch";
import { readApiJson } from "../api-response";
import type { ReportingSources } from "../reporting-source-contract";
import { clientSheetsReportingMessages as englishCopy } from "@/messages/en.json";
import { clientSheetsReportingMessages as ukrainianCopy } from "@/messages/uk.json";
export class SheetsReportingRefreshError extends Error {
  constructor(readonly code: string, readonly requestId?: string) {
    super(code);
  }
}
async function sheetsJson(
  fetcher: typeof apiFetch,
  path: string,
  init?: RequestInit,
) {
  const r = await fetcher(path, init), parsed = await readApiJson(r);
  const body: Record<string, unknown> = parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  if (!r.ok)
    throw new SheetsReportingRefreshError(
      responseTimeout(r.status) ? "SHEETS_REFRESH_TIMEOUT"
        : typeof body.code === "string" ? body.code : "SHEETS_REFRESH_FAILED",
      typeof body.requestId === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(body.requestId)
        ? body.requestId : undefined,
    );
  return body;
}
const responseTimeout = (status: number) => status === 408 || status === 504;
export async function selectedSheetsProjectionIntent(
  fetcher: typeof apiFetch = apiFetch,
) {
  const sources = (await sheetsJson(
    fetcher, "/api/connectors/source",
  )) as unknown as ReportingSources;
  const chosen = sources.connections.find(
    (c) => c.sourceId === sources.sourceId,
  );
  if (chosen?.provider !== "sheets") return null;
  const path = `/api/connectors/sheets/projection/${encodeURIComponent(chosen.sourceId)}`;
  const intent = await sheetsJson(fetcher, path);
  return { path, intent };
}
export async function refreshSelectedSheetsReports(
  expectedImportRunId?: string,
  fetcher: typeof apiFetch = apiFetch,
) {
  const selected = await selectedSheetsProjectionIntent(fetcher);
  if (!selected) return { state: "NOT_SELECTED" as const };
  const { path, intent } = selected;
  if (expectedImportRunId && intent.importRunId !== expectedImportRunId)
    throw new SheetsReportingRefreshError("SHEETS_PROJECTION_CHANGED");
  await sheetsJson(fetcher, path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      importRunId: intent.importRunId,
      mappingId: intent.mappingId,
      selectionRevision: intent.selectionRevision,
    }),
  });
  return { state: "READY" as const };
}
export function sheetsRefreshMessage(code: string, lang: "uk" | "en") {
  const uk = lang === "uk";
  if (code === "SHEETS_CATALOG_IDENTITY_CONFLICT")
    return uk
      ? ukrainianCopy.importSavedTheCatalogueHas
      : englishCopy.importSavedTheCatalogueHas;
  if (code === "SHEETS_REFRESH_TIMEOUT")
    return uk
      ? ukrainianCopy.mVPProjectionTimedOutThe
      : englishCopy.mVPProjectionTimedOutThe;
  if (["SHEETS_MAPPING_UNAVAILABLE", "SHEETS_REFRESH_FAILED"].includes(code))
    return uk
      ? ukrainianCopy.theServerCouldNotFinish
      : englishCopy.theServerCouldNotFinish;
  if (
    ["SHEETS_MAPPING_REQUIRED", "SHEETS_MAPPING_REVISION_CONFLICT"].includes(
      code,
    )
  )
    return uk
      ? ukrainianCopy.importSavedApproveGoogleSheets
      : englishCopy.importSavedApproveGoogleSheets;
  if (code === "SHEETS_PROJECTION_CHANGED")
    return uk
      ? ukrainianCopy.theSourceOrImportChanged
      : englishCopy.theSourceOrImportChanged;
  return uk
    ? ukrainianCopy.mVPReportsCouldNotBe
    : englishCopy.mVPReportsCouldNotBe;
}
