import type { Ref } from "react";
import { Heading } from "@/components/ui/heading/heading";
import type { Lang } from "@/lib/translations";
import type { CsvResource } from "@/lib/connectors/csv/schema";
import type { CsvPreview, CsvPacketAction } from "../csv-import-card/csv-import-types";
import { csvResourceNames as names, rowErrorCopy } from "../csv-import-card/copy";
import { csvButton as button } from "../csv-import-card/csv-import-styles";

export function CsvPreviewPanel({ preview, lang, busy, suppliers, panelRef, onAction }: {
  preview: CsvPreview;
  lang: Lang;
  busy: boolean;
  suppliers: Array<{ id: string; name: string }>;
  panelRef?: Ref<HTMLDivElement>;
  onAction: (action: CsvPacketAction) => void | Promise<void>;
}) {
  const uk = lang === "uk";
  const copy = (ukText: string, enText: string) => uk ? ukText : enText;
  return (
    <div
      className="space-y-4 rounded-xl border border-(--border) p-4"
      ref={panelRef}
      tabIndex={-1}
      aria-live="polite"
    >
      <Heading as="h3" variant="compact" className="text-base font-medium">
        {copy("Результат перевірки", "Preview result")} —{" "}
        {preview.state}
      </Heading>
      <p className="text-sm text-(--muted)">
        {Object.entries(preview.preview.counts)
          .map(([r, n]) => `${names[lang][r as CsvResource]}: ${n}`)
          .join("; ")}
      </p>
      <p className="text-xs text-(--muted)">
        {copy(
          "Термін зберігання неактивованого пакета:",
          "Unactivated packet retention:",
        )}{" "}
        {new Date(preview.expiresAt).toLocaleDateString(
          uk ? "uk-UA" : "en-GB",
        )}
        .{" "}
        {copy(
          "Активовані файли зберігаються для аудиту.",
          "Activated files are retained for audit.",
        )}
      </p>
      <p className="break-all text-xs text-(--muted)">
        SHA-256: {preview.contentHash}
      </p>
      {preview.options && (
        <details className="text-sm text-(--muted)">
          <summary className="cursor-pointer">
            {copy(
              "Зафіксовані правила та колонки",
              "Frozen rules and column mappings",
            )}
          </summary>
          <div className="mt-3 space-y-3 wrap-break-word">
            <p>
              {preview.options.timezone} ·{" "}
              {preview.options.policy.amounts.currency} ·{" "}
              {copy("версія", "revision")}{" "}
              {preview.options.mappingRevision}
            </p>
            <p>
              {copy("Каталог / залишки:", "Catalog / stock:")}{" "}
              {preview.options.catalog} / {preview.options.stock}.{" "}
              {preview.options.policy.amounts.price} ·{" "}
              {preview.options.discountUnit} ·{" "}
              {preview.options.policy.amounts.absoluteDiscount}
            </p>
            <p>
              {copy("Статуси:", "Statuses:")}{" "}
              {Object.entries(preview.options.policy.statuses)
                .map(([k, v]) => `${k}: ${v}`)
                .join("; ")}
            </p>
            <p>
              {copy("Канали:", "Channels:")}{" "}
              {Object.entries(preview.options.policy.channels)
                .map(([k, v]) => `${k}: ${v}`)
                .join("; ")}
            </p>
            {preview.options.history && (
              <p>
                {copy("Історія замовлень:", "Order history:")}{" "}
                {preview.options.history.from} –{" "}
                {preview.options.history.to};{" "}
                {String(preview.options.history.complete)}
              </p>
            )}
            {preview.options.receiptHistory && (
              <p>
                {copy("Історія приходів:", "Receipt history:")}{" "}
                {preview.options.receiptHistory.from} –{" "}
                {preview.options.receiptHistory.to};{" "}
                {String(preview.options.receiptHistory.complete)};
                baseline:{" "}
                {String(preview.options.receiptBaseline ?? false)}
              </p>
            )}
            {preview.options.policy.receipts && (
              <p>
                {copy(
                  "Проведені статуси / постачальники:",
                  "Posted statuses / suppliers:",
                )}{" "}
                {preview.options.policy.receipts.postedStatuses.join(
                  ", ",
                )}{" "}
                /{" "}
                {Object.entries(
                  preview.options.policy.receipts.suppliers,
                )
                  .map(
                    ([k, v]) =>
                      `${k}: ${suppliers.find((s) => s.id === v)?.name ?? v}`,
                  )
                  .join("; ")}
              </p>
            )}
            {preview.mappings?.map((m) => (
              <div key={m.resource}>
                <a
                  className="underline"
                  href={`/api/connectors/csv/uploads/${preview.id}?file=${m.resource}`}
                  download
                >
                  {names[lang][m.resource]}
                </a>{" "}
                (
                {m.delimiter === "\t"
                  ? copy("табуляція", "tab")
                  : m.delimiter}
                )
                <ul className="list-inside list-disc">
                  {Object.entries(m.columns).map(([field, header]) => (
                    <li key={field}>
                      {field}: {header}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </details>
      )}
      {preview.preview.errors.length > 0 && (
        <ul className="list-inside list-disc space-y-1 text-sm text-(--text)">
          {preview.preview.errors.map((e, i) => (
            <li key={i}>
              <a
                className="underline"
                href={`#csv-file-${e.resource}`}
                onClick={() => {
                  const details = document.getElementById(
                    `csv-file-${e.resource}`,
                  );
                  if (details instanceof HTMLDetailsElement)
                    details.open = true;
                }}
              >
                {names[lang][e.resource as CsvResource]} ·{" "}
                {copy("рядок", "row")} {e.row || "—"}{" "}
                {e.field ? `(${e.field})` : ""}:{" "}
                {rowErrorCopy[e.code]?.[uk ? 0 : 1] ??
                  copy(
                    "Виправте рядок або мапінг. Код: ",
                    "Correct the row or mapping. Code: ",
                  ) + e.code}
              </a>
            </li>
          ))}
        </ul>
      )}
      {preview.preview.warnings.length > 0 && (
        <details className="text-sm text-(--muted)">
          <summary className="cursor-pointer">
            {copy(
              "Обмеження та попередження",
              "Limitations and warnings",
            )}
          </summary>
          <ul className="mt-2 list-inside list-disc">
            {preview.preview.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </details>
      )}
      {preview.job?.errorCode && (
        <p role="alert" className="text-sm text-(--text)">
          {copy("Імпорт зупинено:", "Import paused:")}{" "}
          {preview.job.errorCode}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className={button}
          disabled={
            busy ||
            preview.state !== "READY" ||
            preview.preview.errors.length > 0
          }
          onClick={() => void onAction("activate")}
        >
          {copy(
            "Активувати перевірений пакет",
            "Activate validated packet",
          )}
        </button>
        {preview.state === "QUEUED" && (
          <button
            type="button"
            className={button}
            disabled={busy}
            onClick={() =>
              void onAction(
                ["FAILED", "PAUSED", "RETRY"].includes(
                  preview.job?.state ?? "",
                )
                  ? "retry"
                  : "process",
              )
            }
          >
            {copy("Продовжити імпорт", "Continue import")}
          </button>
        )}
        <button
          type="button"
          className={button}
          disabled={
            busy ||
            ["ACTIVE", "CANCELLED", "EXPIRED"].includes(preview.state)
          }
          onClick={() => void onAction("cancel")}
        >
          {copy("Скасувати пакет", "Cancel packet")}
        </button>
      </div>
      <p className="text-xs text-(--muted)">
        {copy(
          "Для активації виберіть CSV у «Джерелі звітів» вище. Перевірка та активація — окремі дії.",
          "To activate, choose CSV in Reporting source above. Preview and activation are separate actions.",
        )}
      </p>
    </div>
  );
}
