import { apiFetch } from "../fetch";
import { readApiJson } from "../api-response";
import type { ReportingSources } from "../reporting-source-contract";
export class SheetsReportingRefreshError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
/** Separate requests preserve the bounded projection budget after the raw import finishes. */
export async function refreshSelectedSheetsReports(
  expectedImportRunId?: string,
  fetcher: typeof apiFetch = apiFetch,
) {
  const json = async (path: string, init?: RequestInit) => {
    const r = await fetcher(path, init),
      body = await readApiJson(r);
    if (!r.ok)
      throw new SheetsReportingRefreshError(
        typeof body.code === "string" ? body.code : "SHEETS_REFRESH_FAILED",
      );
    return body;
  };
  const sources = (await json(
    "/api/connectors/source",
  )) as unknown as ReportingSources;
  const chosen = sources.connections.find(
    (c) => c.sourceId === sources.sourceId,
  );
  if (chosen?.provider !== "sheets") return { state: "NOT_SELECTED" as const };
  const path = `/api/connectors/sheets/projection/${encodeURIComponent(chosen.sourceId)}`;
  const intent = await json(path);
  if (expectedImportRunId && intent.importRunId !== expectedImportRunId)
    throw new SheetsReportingRefreshError("SHEETS_PROJECTION_CHANGED");
  await json(path, {
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
