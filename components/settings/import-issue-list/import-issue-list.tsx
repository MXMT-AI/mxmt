"use client";
import { useState } from "react";
import { useImportIssues } from "./use-import-issues";
import { qualityLabel, qualityGuidance } from "@/lib/data-quality-copy";
import { Button } from "@/components/ui/button/button";
import { Field } from "@/components/ui/field/field";
import { Text } from "@/components/ui/text/text";
import { control } from "@/components/ui/control-styles/control-styles";
import { settingsImportIssueListMessages as englishCopy } from "@/messages/en.json";
import { settingsImportIssueListMessages as ukrainianCopy } from "@/messages/uk.json";
export default function ImportIssueList({
  lang,
  revision,
}: {
  lang: "uk" | "en";
  revision: number;
}) {
  const uk = lang === "uk",
    [open, setOpen] = useState(false),
    [page, setPage] = useState(1),
    [code, setCode] = useState("SKU_ALIAS_UNRESOLVED");
  const { data, error, loading, retry } = useImportIssues({ open, page, code, revision });
  return (
    <details
      className="mt-6 text-sm"
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary className="cursor-pointer min-h-11 py-3 font-semibold focus-visible:outline-solid">
        {uk
          ? ukrainianCopy.importWarningsAndUnmatchedSales
          : englishCopy.importWarningsAndUnmatchedSales}
      </summary>
      <Text variant="body" className="my-2 leading-normal text-(--muted)">
        {uk
          ? ukrainianCopy.warningHistoryForTheCurrent
          : englishCopy.warningHistoryForTheCurrent}
      </Text>
      <Field label={uk ? ukrainianCopy.labelShow : englishCopy.labelShow} className="flex-row flex-wrap items-center gap-2 text-sm text-inherit">
        <select
          name="import-issue-code"
          aria-label={uk ? ukrainianCopy.ariaLabelWarningCode : englishCopy.ariaLabelWarningCode}
          className={control + " w-auto"}
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            setPage(1);
          }}
        >
          <option value="SKU_ALIAS_UNRESOLVED">
            {qualityLabel("SKU_ALIAS_UNRESOLVED", lang)}
          </option>
          <option value="">{uk ? ukrainianCopy.allWarnings : englishCopy.allWarnings}</option>
        </select>
      </Field>
      {loading ? (
        <Text variant="body" role="status" className="leading-normal text-inherit">{uk ? ukrainianCopy.loading : englishCopy.loading}</Text>
      ) : error ? (
        <Text variant="body" role="alert" className="leading-normal text-inherit">
          {uk
            ? ukrainianCopy.warningsUnavailablePleaseRetry
            : englishCopy.warningsUnavailablePleaseRetry}
          <Button
            variant="report"
            onClick={retry}
            type="button"
          >
            {uk ? ukrainianCopy.retry : englishCopy.retry}
          </Button>
        </Text>
      ) : (
        <>
          <ul>
            {data?.rows.map((row) => (
              <li
                key={row.id}
                className="border-t border-(--border) py-3 wrap-break-word"
              >
                <Text variant="body" className="font-medium leading-normal text-inherit">
                  {qualityLabel(row.code, lang)} ·{" "}
                  <span translate="no">
                    {row.context.sku ??
                      row.context.sourceSku ??
                      row.entityKey ??
                      "—"}
                  </span>
                </Text>
                <Text variant="body" className="mt-1 leading-normal text-(--muted)">
                  {qualityGuidance(row.code, lang)}
                </Text>
                <dl className="mt-2 break-all text-xs text-(--muted)">
                  {Object.entries({
                    [uk ? ukrainianCopy.source : englishCopy.source]: row.sourceId,
                    [uk ? ukrainianCopy.import : englishCopy.import]: row.importRunId,
                    [uk ? ukrainianCopy.sourceRecord : englishCopy.sourceRecord]:
                      row.context.sourceRecordKey,
                    [uk ? ukrainianCopy.order : englishCopy.order]: row.context.orderId,
                    [uk ? ukrainianCopy.line : englishCopy.line]: row.context.lineId,
                  }).map(([label, value]) =>
                    value ? (
                      <div key={label}>
                        <dt className="inline">{label}: </dt>
                        <dd className="inline" translate="no">
                          {value}
                        </dd>
                      </div>
                    ) : null,
                  )}
                </dl>
              </li>
            ))}
          </ul>
          {data && !data.rows.length && (
            <Text variant="body" className="my-3 leading-normal text-inherit">
              {uk ? ukrainianCopy.noWarningsFound : englishCopy.noWarningsFound}
            </Text>
          )}
          <nav
            aria-label={uk ? ukrainianCopy.ariaLabelWarningPages : englishCopy.ariaLabelWarningPages}
            className="mt-3 flex flex-wrap gap-2 items-center"
          >
            <Button
              variant="report"
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              {uk ? ukrainianCopy.previous : englishCopy.previous}
            </Button>
            <span>
              {page} / {Math.max(1, data?.pagination.totalPages ?? 1)}
            </span>
            <Button
              variant="report"
              type="button"
              disabled={!data || page >= data.pagination.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              {uk ? ukrainianCopy.next : englishCopy.next}
            </Button>
          </nav>
        </>
      )}
    </details>
  );
}
