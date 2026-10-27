"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/fetch";
import { readApiJson } from "@/lib/api-response";
import { qualityLabel, qualityGuidance } from "@/lib/data-quality-copy";
import { button } from "@/components/merchandising/ReportPrimitives";
interface Issue {
  id: string;
  code: string;
  severity: string;
  importRunId: string;
  sourceId: string;
  createdAt: string;
  entityKey: string | null;
  context: Record<string, string | null>;
}
interface Result extends Record<string, unknown> {
  rows: Issue[];
  pagination: { totalRows: number; totalPages: number };
}
/** Fetch warning history only when opened; expose safe source identifiers, never raw order payloads. */
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
    [code, setCode] = useState("SKU_ALIAS_UNRESOLVED"),
    [data, setData] = useState<Result | null>(null),
    [error, setError] = useState(false),
    [retry, setRetry] = useState(0),
    [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!open) return;
    const c = new AbortController();
    setLoading(true);
    setError(false);
    apiFetch(
      `/api/data/issues?source=salesdrive&pageSize=25&page=${page}&code=${code}`,
      { signal: c.signal, cache: "no-store" },
    )
      .then(async (r) => {
        const result = await readApiJson<Result>(r);
        if (!r.ok || !Array.isArray(result.rows)) throw new Error();
        if (!c.signal.aborted) setData(result);
      })
      .catch(() => {
        if (!c.signal.aborted) setError(true);
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [open, page, code, revision, retry]);
  return (
    <details
      className="mt-6 text-sm"
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary className="cursor-pointer min-h-11 py-3 font-semibold focus-visible:outline">
        {uk
          ? "Попередження імпорту та незв’язані продажі"
          : "Import warnings and unmatched sales"}
      </summary>
      <p className="my-2 text-[var(--muted)]">
        {uk
          ? "Історія попереджень поточного підключення. Виправлені незв’язані продажі не показуються. Інші історичні попередження можуть уже бути виправлені — перевірте поточну діагностику."
          : "Warning history for the current connection. Resolved unmatched sales are omitted. Other historical warnings may already be corrected; check current diagnostics."}
      </p>
      <label>
        {uk ? "Показати" : "Show"}
        <select
          name="import-issue-code"
          aria-label={uk ? "Код попередження" : "Warning code"}
          className={button + " ml-2 bg-[var(--surface)]"}
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            setPage(1);
          }}
        >
          <option value="SKU_ALIAS_UNRESOLVED">
            {qualityLabel("SKU_ALIAS_UNRESOLVED", lang)}
          </option>
          <option value="">{uk ? "Усі попередження" : "All warnings"}</option>
        </select>
      </label>
      {loading ? (
        <p role="status">{uk ? "Завантаження…" : "Loading…"}</p>
      ) : error ? (
        <p role="alert">
          {uk
            ? "Попередження недоступні. Повторіть спробу."
            : "Warnings unavailable. Please retry."}
          <button
            className={button}
            onClick={() => setRetry((n) => n + 1)}
            type="button"
          >
            {uk ? "Повторити" : "Retry"}
          </button>
        </p>
      ) : (
        <>
          <ul>
            {data?.rows.map((row) => (
              <li
                key={row.id}
                className="border-t border-[var(--border)] py-3 break-words"
              >
                <p className="font-medium">
                  {qualityLabel(row.code, lang)} ·{" "}
                  <span translate="no">
                    {row.context.sku ??
                      row.context.sourceSku ??
                      row.entityKey ??
                      "—"}
                  </span>
                </p>
                <p className="mt-1 text-[var(--muted)]">
                  {qualityGuidance(row.code, lang)}
                </p>
                <dl className="mt-2 break-all text-xs text-[var(--muted)]">
                  {Object.entries({
                    [uk ? "Джерело" : "Source"]: row.sourceId,
                    [uk ? "Імпорт" : "Import"]: row.importRunId,
                    [uk ? "Запис джерела" : "Source record"]:
                      row.context.sourceRecordKey,
                    [uk ? "Замовлення" : "Order"]: row.context.orderId,
                    [uk ? "Рядок" : "Line"]: row.context.lineId,
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
            <p className="my-3">
              {uk ? "Попереджень не знайдено." : "No warnings found."}
            </p>
          )}
          <nav
            aria-label={uk ? "Сторінки попереджень" : "Warning pages"}
            className="mt-3 flex flex-wrap gap-2 items-center"
          >
            <button
              type="button"
              className={button}
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              {uk ? "Назад" : "Previous"}
            </button>
            <span>
              {page} / {Math.max(1, data?.pagination.totalPages ?? 1)}
            </span>
            <button
              type="button"
              className={button}
              disabled={!data || page >= data.pagination.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              {uk ? "Далі" : "Next"}
            </button>
          </nav>
        </>
      )}
    </details>
  );
}
