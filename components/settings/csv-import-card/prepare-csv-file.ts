import { CSV_FIELDS, type CsvFileInput, type CsvResource } from "@/lib/connectors/csv/schema";
import { parseCsv } from "@/lib/connectors/csv/parser";
import type { CsvFileDraft } from "./csv-import-types";

function encodeBytes(bytes: Uint8Array) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(binary);
}

export function prepareCsvFile(resource: CsvResource, name: string, bytes: Uint8Array, delimiter: CsvFileInput["delimiter"]): CsvFileDraft {
  const { headers } = parseCsv(bytes, delimiter);
  const columns = Object.fromEntries(CSV_FIELDS[resource]
    .filter(field => headers.includes(field))
    .map(field => [field, field]));
  return {
    name,
    headers,
    file: { resource, bytes: encodeBytes(bytes), delimiter, columns },
  };
}

export function reparseCsvFile(draft: CsvFileDraft, delimiter: CsvFileInput["delimiter"]): CsvFileDraft {
  const bytes = Uint8Array.from(atob(draft.file.bytes), char => char.charCodeAt(0));
  return prepareCsvFile(draft.file.resource, draft.name, bytes, delimiter);
}
