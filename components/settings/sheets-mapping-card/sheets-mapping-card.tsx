"use client";
import { Button } from "@/components/ui/button/button";
import { Heading } from "@/components/ui/heading/heading";
import { Text } from "@/components/ui/text/text";
import { panel } from "@/components/ui/panel/panel-styles";
import { useState } from "react";
import { useRouter } from "@/i18n/navigation";

import { Link } from "@/i18n/navigation";
import { useSheetsMappingAction } from "./use-sheets-mapping-action";
import { SheetsMappingDictionaries } from "../sheets-mapping-dictionaries/sheets-mapping-dictionaries";
import { SheetsMappingPolicyFields } from "../sheets-mapping-policy-fields/sheets-mapping-policy-fields";
import { SheetsColumnMapping } from "../sheets-column-mapping/sheets-column-mapping";
import { SheetsMappingPreviewPanel } from "../sheets-mapping-preview-panel/sheets-mapping-preview-panel";
import { Field } from "@/components/ui/field/field";
import { control } from "@/components/ui/control-styles/control-styles";
import {
  type SheetsFieldMapping,
  type SheetsMappingPreview,
} from "@/lib/sheets-mapping-contract";
import { useSheetsMappingData } from "./use-sheets-mapping-data";
import { settingsSheetsMappingCardMessages as englishCopy } from "@/messages/en.json";
import { settingsSheetsMappingCardMessages as ukrainianCopy } from "@/messages/uk.json";
export default function SheetsMappingCard({
  lang,
  canManage,
}: {
  lang: "uk" | "en";
  canManage: boolean;
}) {
  const uk = lang === "uk",
    router = useRouter();
  const [sourceId, setSourceId] = useState("");
  const [preview, setPreview] = useState<SheetsMappingPreview | null>(null);
  const [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [reference, setReference] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [reload, setReload] = useState(0);
  const { sources, meta, setMeta, draft, setDraft, sourcesLoading, loading } = useSheetsMappingData({
    canManage, sourceId, reload, lang, onError: setError,
    onReset: () => { setPreview(null); setReference(""); setConfirmed(false); setMessage(""); },
  });
  function edit(update: (value: SheetsFieldMapping) => void) {
    setDraft((old) => {
      if (!old) return old;
      const next = structuredClone(old);
      update(next);
      return next;
    });
    setPreview(null);
    setConfirmed(false);
    setMessage("");
    setError("");
  }
  const { busy, action } = useSheetsMappingAction({
    lang, canManage, loading, onError: setError, onMessage: setMessage,
    onPreview: result => {
      setPreview(result);
        setMeta((old) =>
          old
            ? {
                ...old,
                revision: result.revision,
                observed: {
                  statuses: Object.entries(result.summary.statusCounts).map(
                    ([id, count]) => ({ id, count }),
                  ),
                  channels: Object.entries(result.summary.channelCounts).map(
                    ([id, count]) => ({ id, count }),
                  ),
                  categories: Object.entries(result.summary.categoryCounts).map(
                    ([name, count]) => ({ name, count }),
                  ),
                },
              }
            : old,
        );
      setConfirmed(false);
    },
    onApproved: () => {
      setPreview(null);
      setConfirmed(false);
      window.dispatchEvent(new Event("connector-connection-changed"));
      router.refresh();
    },
  });
  if (!canManage) return null;
  const productColumns =
      meta?.input.sheets.find((s) => s.sheetKey === "product_yml")?.columns ??
      [],
    orderColumns =
      meta?.input.sheets.find((s) => s.sheetKey === "zavod_api")?.columns ?? [];
  return (
    <section className={panel + " mb-10 p-5"}>
      <Heading as="h2" variant="compact" className="text-base">
        {uk
          ? ukrainianCopy.googleSheetsDataMapping
          : englishCopy.googleSheetsDataMapping}
      </Heading>
      <Text variant="body" className="leading-normal text-base text-inherit mt-1 mb-4 text-sm text-(--muted)">
        {uk
          ? ukrainianCopy.reviewFieldsAndBusinessRules
          : englishCopy.reviewFieldsAndBusinessRules}
      </Text>
      <div className="flex flex-wrap items-end gap-3">
        <Field label={uk ? ukrainianCopy.labelSavedSpreadsheet : englishCopy.labelSavedSpreadsheet}>
          <select
            className={control}
            value={sourceId}
            disabled={busy || loading || sourcesLoading || sources.length === 0}
            onChange={(e) => setSourceId(e.target.value)}
          >
            <option value="">
              {uk ? ukrainianCopy.selectSpreadsheet : englishCopy.selectSpreadsheet}
            </option>
            {sources.map((s) => (
              <option key={s.sourceId} value={s.sourceId}>
                {s.accountHost}
              </option>
            ))}
          </select>
        </Field>
        {sourceId ? (
          <Button variant="report"
            className="bg-(--surface) px-3 text-(--text)"
            type="button"
            disabled={busy || loading}
            onClick={() => setReload((n) => n + 1)}
          >
            {uk ? ukrainianCopy.reloadMapping : englishCopy.reloadMapping}
          </Button>
        ) : null}
      </div>
      {sourcesLoading ? (
        <Text variant="body" role="status" className="leading-normal text-base text-inherit mt-3 text-sm">
          {uk ? ukrainianCopy.loadingSpreadsheets : englishCopy.loadingSpreadsheets}
        </Text>
      ) : !sources.length && !error ? (
        <Text variant="body" className="leading-normal text-base text-inherit mt-3 text-sm text-(--muted)">
          {uk
            ? ukrainianCopy.noSavedSpreadsheetsYetImport
            : englishCopy.noSavedSpreadsheetsYetImport}
          <Link className="underline" href="/data-reporting">
            {uk ? ukrainianCopy.dataReports : englishCopy.dataReports}
          </Link>
          .
        </Text>
      ) : null}
      {loading ? (
        <Text variant="body" role="status" className="leading-normal text-base text-inherit mt-3">
          {uk ? ukrainianCopy.loadingFields : englishCopy.loadingFields}
        </Text>
      ) : null}
      {meta && draft ? (
        <fieldset disabled={busy || loading} className="mt-5 min-w-0 space-y-5">
          <legend className="text-sm text-(--muted)">
            {uk ? ukrainianCopy.import : englishCopy.import}:{" "}
            {new Date(meta.input.importedAt).toLocaleString(
              uk ? "uk-UA" : "en-GB",
            )}{" "}
            · {uk ? ukrainianCopy.revision : englishCopy.revision} {meta.revision} ·{" "}
            {meta.input.timezone}
          </legend>
          {(["products", "orders"] as const).map(resource => (
            <SheetsColumnMapping
              key={resource} resource={resource} value={draft[resource]} lang={lang}
              columns={resource === "products" ? productColumns : orderColumns}
              onChange={(field, column) => edit(value => {
                (value[resource] as Record<string, string | null>)[field] = column;
              })}
            />
          ))}
          <SheetsMappingPolicyFields policy={draft.policy} lang={lang} onChange={update => edit(value => update(value.policy))} />
          <SheetsMappingDictionaries policy={draft.policy} observed={meta.observed} lang={lang} onChange={update => edit(value => update(value.policy))} />
          <Button variant="report"
            type="button"
            className="bg-(--surface) px-3 text-(--text)"
            disabled={!draft.policy.currency}
            onClick={() => void action({ kind: "preview", sourceId, meta, draft })}
          >
            {busy
              ? uk
                ? ukrainianCopy.checking
                : englishCopy.checking
              : uk
                ? ukrainianCopy.previewMapping
                : englishCopy.previewMapping}
          </Button>
        </fieldset>
      ) : null}
      {preview && <SheetsMappingPreviewPanel
        preview={preview} lang={lang} reference={reference} confirmed={confirmed} busy={busy}
        onReferenceChange={setReference} onConfirmedChange={setConfirmed} onApprove={() => void action({ kind: "approve", sourceId, preview, reference, confirmed })}
      />}
      {error ? (
        <Text variant="body" role="alert" className="leading-normal text-base text-inherit mt-3 text-sm text-red-500">
          {error}
        </Text>
      ) : null}
      <Text variant="body" role="status" className="leading-normal text-base text-inherit mt-3 text-sm text-(--muted)">
        {message}
      </Text>
    </section>
  );
}
