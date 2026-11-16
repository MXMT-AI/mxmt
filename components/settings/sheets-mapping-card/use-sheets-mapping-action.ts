"use client";
import { useRef, useState } from "react";
import { apiFetch } from "@/lib/fetch";
import { readApiJson } from "@/lib/api-response";
import type { Lang } from "@/lib/translations";
import type { SheetsFieldMapping, SheetsMappingMetadata, SheetsMappingPreview } from "@/lib/sheets-mapping-contract";
import { mappingError } from "./copy";

type MappingAction = { sourceId: string } & (
  { kind: "preview"; meta: SheetsMappingMetadata | null; draft: SheetsFieldMapping | null }
  | { kind: "approve"; preview: SheetsMappingPreview | null; reference: string; confirmed: boolean }
);

export function useSheetsMappingAction({ lang, canManage, loading, onPreview, onApproved, onError, onMessage }: {
  lang: Lang;
  canManage: boolean;
  loading: boolean;
  onPreview: (preview: SheetsMappingPreview) => void;
  onApproved: () => void;
  onError: (message: string) => void;
  onMessage: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  async function action(input: MappingAction) {
    if (!canManage || loading || !input.sourceId || inFlight.current) return;
    let body: Record<string, unknown>;
    if (input.kind === "preview") {
      if (!input.meta || !input.draft || !input.draft.policy.currency) return;
      body = { expectedRevision: input.meta.revision, importRunId: input.meta.input.importRunId, mapping: input.draft };
    } else {
      if (!input.preview || !input.confirmed || !input.reference.trim() || input.preview.summary.blockingErrors.length) return;
      body = { configId: input.preview.configId, previewHash: input.preview.previewHash, reference: input.reference };
    }
    inFlight.current = true;
    setBusy(true);
    onError("");
    onMessage("");
    try {
      const response = await apiFetch(`/api/connectors/sheets/mapping/${encodeURIComponent(input.sourceId)}/${input.kind}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const data = await readApiJson(response);
      if (!response.ok) throw Error(mappingError(data, lang));
      if (input.kind === "preview") onPreview(data as unknown as SheetsMappingPreview);
      else {
        onMessage(lang === "uk"
          ? "Зіставлення погоджено. Вибір джерела та імпорт у спільну модель виконуються окремо."
          : "Mapping approved. Source selection and shared-model import are separate actions.");
        onApproved();
      }
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "Mapping unavailable");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return { busy, action };
}
