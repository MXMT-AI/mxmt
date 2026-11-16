import { Text } from "@/components/ui/text/text";
import type { Lang } from "@/lib/translations";
import type { Progress, ImportResponse } from "../sales-drive-import-card/import-types";
import { errorLabel, importStateLabels } from "../sales-drive-import-card/copy";

export function ImportSyncProgress({ job, syncInfo, lang, generic = false }: {
  job: Progress | null;
  syncInfo: ImportResponse;
  lang: Lang;
  generic?: boolean;
}) {
  const uk = lang === "uk", locale = uk ? "uk-UA" : "en-GB";
  const labels = importStateLabels[lang];
  const date = (value: string) => new Date(value).toLocaleString(locale);
  const calculationState = syncInfo.calculation?.state;
  const calculationMessage = calculationState === "COMPLETE"
    ? uk ? "Показники перераховано." : "Metrics recalculated."
    : ["WAITING_ENGINE", "PENDING", "RUNNING"].includes(calculationState ?? "")
      ? uk ? "Дані імпортовано. Оновлюємо показники продажів і запасів…" : "Inputs imported. Updating sales and stock metrics…"
      : calculationState === "FAILED"
        ? uk ? "Не вдалося оновити показники. Повторимо спробу автоматично." : "Could not update metrics. We will retry automatically."
        : null;
  return (
    <>
      {job && (
        <Text variant="body" className="leading-normal mt-2 break-all text-sm text-(--muted)">
          {uk ? "Цикл" : "Cycle"}: {job.id}
        </Text>
      )}
      {job?.state === "COMPLETE" && (
        <Text variant="body" className="leading-normal mt-2 text-sm text-(--muted)">
          {uk ? "Завершено" : "Completed"}:{" "}
          {date(job.updatedAt)}
        </Text>
      )}
      <Text variant="body" className="leading-normal mt-2 text-sm text-(--muted)">
        {uk ? "Останній виклик планувальника" : "Last scheduler tick"}:{" "}
        {syncInfo.lastTickAt
          ? date(syncInfo.lastTickAt)
          : uk
            ? "ще немає — підключіть зовнішній планувальник"
            : "none yet — connect an external scheduler"}
      </Text>
      {syncInfo.backfill && (
        <Text variant="body" className="leading-normal mt-2 text-sm text-(--muted)">
          {uk ? "Історичний імпорт" : "Historical import"}:{" "}
          {labels[syncInfo.backfill.state] ?? syncInfo.backfill.state};{" "}
          {uk ? "сторінок" : "pages"} {syncInfo.backfill.stats.pages ?? 0};{" "}
          {uk ? "замовлень" : "orders"}{" "}
          {syncInfo.backfill.stats.orders ?? 0}.
        </Text>
      )}
      {syncInfo.resources?.map((r) => (
        <Text variant="body" key={r.resource} className="leading-normal mt-3 text-sm text-(--muted)">
          {r.resource === "orders"
            ? uk
              ? "Замовлення"
              : "Orders"
            : uk
              ? "Залишки"
              : "Stock"}
          : {uk ? "останнє завершення" : "last completion"}{" "}
          {r.lastSuccess
            ? date(r.lastSuccess)
            : uk
              ? "ще немає"
              : "none yet"}
          ; {uk ? "у черзі" : "pending"}{" "}
          {r.pending.toLocaleString(locale)}.{" "}
          {r.lagSeconds !== null &&
            `${uk ? "Відставання (хв)" : "Lag (min)"}: ${Math.ceil(r.lagSeconds / 60).toLocaleString(locale)}.`}{" "}
          {r.errorCode && errorLabel(r.errorCode, uk,generic)}
        </Text>
      ))}
      <div role="status" aria-live="polite">
        {calculationMessage && <Text variant="body" className="mt-3 leading-normal text-(--muted)">{calculationMessage}</Text>}
      </div>
      {job?.state === "PAUSED" && (
        <Text variant="body" className="leading-normal mt-3 text-sm text-(--muted)">
          {uk
            ? "Відновіть цикл після виправлення з’єднання або налаштувань."
            : "Resume this cycle after correcting the connection or source settings."}
        </Text>
      )}
    </>
  );
}
