import { apiFetch } from "../fetch";
import { readApiJson } from "../api-response";
import type { ReportingSources } from "../reporting-source-contract";
export class SheetsReportingRefreshError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
async function sheetsJson(
  fetcher: typeof apiFetch,
  path: string,
  init?: RequestInit,
) {
  const r = await fetcher(path, init), body = await readApiJson(r);
  if (!r.ok)
    throw new SheetsReportingRefreshError(
      typeof body.code === "string" ? body.code : "SHEETS_REFRESH_FAILED",
    );
  return body;
}
/** Read readiness from the selected source, independently of the legacy Sheets tab. */
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
/** Separate requests preserve the bounded projection budget after the raw import finishes. */
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
  if (
    ["SHEETS_MAPPING_REQUIRED", "SHEETS_MAPPING_REVISION_CONFLICT"].includes(
      code,
    )
  )
    return uk
      ? "Імпорт збережено. Погодьте зіставлення Google Sheets у налаштуваннях, потім оновіть MVP-звіти."
      : "Import saved. Approve Google Sheets mapping in Settings, then refresh MVP reports.";
  if (code === "SHEETS_PROJECTION_CHANGED")
    return uk
      ? "Джерело або імпорт змінилися. Перевірте вибір у налаштуваннях і повторіть оновлення MVP-звітів."
      : "The source or import changed. Review Settings and retry MVP report refresh.";
  return uk
    ? "Не вдалося оновити MVP-звіти. Збережений імпорт залишається доступним; перевірте джерело й зіставлення у налаштуваннях."
    : "MVP reports could not be refreshed. The saved import remains available; check source selection and mapping in Settings.";
}
