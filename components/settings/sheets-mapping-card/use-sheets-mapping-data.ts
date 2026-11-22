"use client";
import { useEffect, useEffectEvent, useState } from "react";
import { apiFetch } from "@/lib/fetch";
import { readApiJson } from "@/lib/api-response";
import type { Lang } from "@/lib/translations";
import type { ReportingSources } from "@/lib/reporting-source-contract";
import type { SheetsFieldMapping, SheetsMappingMetadata } from "@/lib/sheets-mapping-contract";
import { mappingError } from "./copy";
import { settingsSheetsMappingCardUseSheetsMappingDataMessages as englishCopy } from "@/messages/en.json";
import { settingsSheetsMappingCardUseSheetsMappingDataMessages as ukrainianCopy } from "@/messages/uk.json";

export function useSheetsMappingData({ canManage, sourceId, reload, lang, onReset, onError }: {
  canManage: boolean;
  sourceId: string;
  reload: number;
  lang: Lang;
  onReset: () => void;
  onError: (message: string) => void;
}) {
  const uk = lang === "uk";
  const [sources, setSources] = useState<ReportingSources["connections"]>([]);
  const [meta, setMeta] = useState<SheetsMappingMetadata | null>(null);
  const [draft, setDraft] = useState<SheetsFieldMapping | null>(null);
  const [sourcesLoading, setSourcesLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const reset = useEffectEvent(onReset);
  const reportError = useEffectEvent(onError);
  useEffect(() => {
    if (!canManage) return;
    const abort = new AbortController();
    setSourcesLoading(true);
    apiFetch("/api/connectors/source", { signal: abort.signal })
      .then(async (r) => {
        const data = await readApiJson(r);
        if (!r.ok) throw Error();
        if (!abort.signal.aborted)
          setSources(
            (data as unknown as ReportingSources).connections.filter(
              (c) => c.provider === "sheets",
            ),
          );
      })
      .catch(() => {
        if (!abort.signal.aborted)
          reportError(
            uk
              ? ukrainianCopy.couldNotLoadSpreadsheets
              : englishCopy.couldNotLoadSpreadsheets,
          );
      })
      .finally(() => {
        if (!abort.signal.aborted) setSourcesLoading(false);
      });
    return () => abort.abort();
  }, [canManage, uk]);
  useEffect(() => {
    setMeta(null);
    setDraft(null);
    reset();
    if (!canManage || !sourceId) {
      setLoading(false);
      return;
    }
    const abort = new AbortController();
    setLoading(true);
    reportError("");
    apiFetch(`/api/connectors/sheets/mapping/${encodeURIComponent(sourceId)}`, {
      signal: abort.signal,
    })
      .then(async (r) => {
        const data = await readApiJson(r);
        if (!r.ok) throw Error(mappingError(data, lang));
        if (!abort.signal.aborted) {
          const value = data as unknown as SheetsMappingMetadata;
          setMeta(value);
          setDraft(value.suggestion);
        }
      })
      .catch((e) => {
        if (!abort.signal.aborted)
          reportError(e instanceof Error ? e.message : englishCopy.mappingUnavailable);
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, [sourceId, reload, canManage, uk]);
  return { sources, meta, setMeta, draft, setDraft, sourcesLoading, loading };
}
