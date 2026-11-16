"use client";

import { useState } from "react";
import { CSV_LIMITS } from "@/lib/connectors/csv/parser";
import type { CsvFileInput, CsvResource } from "@/lib/connectors/csv/schema";
import type { CsvFileDraft } from "./csv-import-types";
import type { useCsvOperation } from "./use-csv-operation";
import { prepareCsvFile, reparseCsvFile } from "./prepare-csv-file";

export function useCsvFiles({ canManage, busy, run, onChanged, onFailure }: {
  canManage: boolean;
  busy: boolean;
  run: ReturnType<typeof useCsvOperation>["run"];
  onChanged: () => void;
  onFailure: (error: unknown, resource?: CsvResource) => void;
}) {
  const [files, setFiles] = useState<Partial<Record<CsvResource, CsvFileDraft>>>({});
  const [delimiters, setDelimiters] = useState<Partial<Record<CsvResource, CsvFileInput["delimiter"]>>>({});
  function remove(resource: CsvResource) {
    setFiles(files => {
      const next = { ...files };
      delete next[resource];
      return next;
    });
  }
  async function choose(resource: CsvResource, file: File | undefined) {
    if (!canManage || busy) return;
    onChanged();
    if (!file) { remove(resource); return; }
    await run(async () => {
      if (file.size > CSV_LIMITS.fileBytes) throw new Error("FILE_TOO_LARGE");
      const bytes = new Uint8Array(await file.arrayBuffer());
      const draft = prepareCsvFile(resource, file.name, bytes, delimiters[resource] ?? ",");
      setFiles(files => ({ ...files, [resource]: draft }));
    }, error => {
      remove(resource);
      onFailure(error, resource);
    });
  }
  function delimiter(resource: CsvResource, value: CsvFileInput["delimiter"]) {
    onChanged();
    setDelimiters(delimiters => ({ ...delimiters, [resource]: value }));
    const old = files[resource];
    if (!old) return;
    try {
      const draft = reparseCsvFile(old, value);
      setFiles(files => ({ ...files, [resource]: draft }));
    } catch (error) {
      onFailure(error);
      remove(resource);
    }
  }
  function mapColumn(resource: CsvResource, field: string, header: string) {
    onChanged();
    setFiles(files => {
      const old = files[resource];
      if (!old) return files;
      const columns = { ...old.file.columns };
      if (header) columns[field] = header;
      else delete columns[field];
      return { ...files, [resource]: { ...old, file: { ...old.file, columns } } };
    });
  }
  return { files, delimiters, choose, delimiter, mapColumn };
}
