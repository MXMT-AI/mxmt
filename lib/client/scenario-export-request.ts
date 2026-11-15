import { apiFetch } from "@/lib/fetch";
import { readApiJson } from "@/lib/api-response";
import type { ExportKind, ScenarioExportCommand, ScenarioExportReceipt } from "@/lib/scenario-export-contract";

export async function fetchExportHistory(kind: ExportKind, signal: AbortSignal) {
  const response = await apiFetch(`/api/merchandising/exports?kind=${kind}`, {
    signal,
    cache: "no-store",
  });
  const body = await readApiJson<{ rows?: ScenarioExportReceipt[] }>(response);
  if (!response.ok || !Array.isArray(body.rows)) throw new Error();
  return body.rows;
}

export async function requestScenarioExport(command: ScenarioExportCommand) {
  const response = await apiFetch("/api/merchandising/exports", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(command),
  });
  const body = await readApiJson<ScenarioExportReceipt & { code?: string } & Record<string, unknown>>(response);
  if (!response.ok || body.exportId !== command.exportId || !Array.isArray(body.files)) {
    throw new Error(body.code ?? "EXPORT_FAILED");
  }
  return body;
}
