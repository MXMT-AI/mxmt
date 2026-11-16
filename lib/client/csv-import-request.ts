import type { CsvPacketAction, CsvPreview } from "@/components/settings/csv-import-card/csv-import-types";
import type { buildCsvPreviewPacket } from "@/components/settings/csv-import-card/build-csv-preview-packet";

export interface CsvUploadsResponse {
  source: { sourceId: string; timezone: string } | null;
  uploads: CsvPreview[];
  suppliers: Array<{ id: string; name: string }>;
}
const uploadsPath = "/api/connectors/csv/uploads";
const packetPath = (id: string) => `${uploadsPath}/${encodeURIComponent(id)}`;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, cache: "no-store" });
  const body: unknown = await response.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("CSV_OPERATION_FAILED");
  const data = body as Record<string, unknown>;
  if (!response.ok || data.error) {
    throw new Error(typeof data.code === "string" ? data.code : "CSV_OPERATION_FAILED");
  }
  return body as T;
}

export function fetchCsvUploads(signal?: AbortSignal) {
  return request<CsvUploadsResponse>(uploadsPath, signal ? { signal } : undefined);
}

export function fetchCsvUpload(id: string, signal?: AbortSignal) {
  return request<CsvPreview>(packetPath(id), { signal });
}

export function previewCsvPacket(packet: ReturnType<typeof buildCsvPreviewPacket>) {
  return request<CsvPreview>(uploadsPath, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(packet),
  });
}

export async function runCsvPacketAction(packet: Pick<CsvPreview, "id" | "contentHash">, action: CsvPacketAction) {
  const path = packetPath(packet.id);
  const send = (kind: CsvPacketAction) => request<unknown>(path, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: kind, hash: packet.contentHash }),
  });
  await send(action);
  if (action === "activate" || action === "retry") await send("process");
  return fetchCsvUpload(packet.id);
}
