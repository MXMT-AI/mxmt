import { apiFetch } from "@/lib/fetch";
import { readApiJson } from "@/lib/api-response";

export interface ImportIssue {
  id: string;
  code: string;
  severity: string;
  importRunId: string;
  sourceId: string;
  createdAt: string;
  entityKey: string | null;
  context: Record<string, string | null>;
}

export interface ImportIssuesResult extends Record<string, unknown> {
  rows: ImportIssue[];
  pagination: { totalRows: number; totalPages: number };
}

export async function fetchImportIssues(page: number, code: string, signal: AbortSignal) {
  const response = await apiFetch(
    `/api/data/issues?source=salesdrive&pageSize=25&page=${page}&code=${encodeURIComponent(code)}`,
    { signal, cache: "no-store" },
  );
  const result = await readApiJson<ImportIssuesResult>(response);
  if (!response.ok || !Array.isArray(result.rows)) throw new Error("IMPORT_ISSUES_UNAVAILABLE");
  return result;
}
