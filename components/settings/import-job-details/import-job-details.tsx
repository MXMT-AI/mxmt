import { Text } from "@/components/ui/text/text";
import type { Lang } from "@/lib/translations";
import type { Progress } from "../sales-drive-import-card/import-types";
import { issueLabel, errorLabel } from "../sales-drive-import-card/copy";

export function ImportJobDetails({ job, resource, lang, generic = false }: {
  job: Progress;
  resource: "orders" | "inventory" | "sync";
  lang: Lang;
  generic?: boolean;
}) {
  const uk = lang === "uk";
  const inventory = resource === "inventory", sync = resource === "sync";
  return (
    <>
      {!sync && (
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          {(inventory
            ? [
                [uk ? "Надходження" : "Receipts", job.stats.receipts],
                [uk ? "Товари" : "Products", job.stats.products],
                [uk ? "Знімки" : "Snapshots", job.stats.snapshots],
                [uk ? "Зміни цін" : "Price changes", job.stats.prices],
              ]
            : [
                [uk ? "Сторінки" : "Pages", job.stats.pages],
                [uk ? "Замовлення" : "Orders", job.stats.orders],
                [uk ? "Оновлено" : "Imported", job.stats.imported],
                [uk ? "Дублікати" : "Duplicates", job.stats.duplicate],
                [uk ? "Застарілі" : "Stale", job.stats.stale],
                [
                  uk ? "Потребують перевірки" : "Quarantined",
                  job.stats.quarantined,
                ],
              ]
          ).map(([label, count]) => (
            <div key={label}>
              <dt className="text-(--muted)">{label}</dt>
              <dd className="tabular-nums text-(--text)">
                {typeof count === "number"
                  ? count.toLocaleString(uk ? "uk-UA" : "en-GB")
                  : count}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {job.stats.warnings > 0 && (
        <Text variant="body" className="leading-normal mt-3 text-sm text-(--text)">
          {uk
            ? "Є попередження якості даних. Перевірте ці попередження перед використанням у звітах."
            : "Data quality warnings exist. Review these warnings before using records in reports."}
        </Text>
      )}
      {job.issues?.length > 0 && (
        <details className="mt-3 text-sm text-(--text)">
          <summary className="cursor-pointer">
            {uk ? "Попередження якості даних" : "Data quality warnings"}
          </summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {job.issues.map((code) => (
              <li key={code} className="wrap-break-word">
                {issueLabel(code, uk,generic)}
              </li>
            ))}
          </ul>
        </details>
      )}
      {job.errorCode && (
        <Text variant="body" className="leading-normal mt-3 wrap-break-word text-sm text-(--text)">
          {uk ? "Причина" : "Reason"}: {errorLabel(job.errorCode, uk,generic)}
        </Text>
      )}
      {job.state === "RETRY" && (
        <Text variant="body" className="leading-normal mt-2 text-sm text-(--muted)">
          {uk ? "Наступна спроба не раніше" : "Next attempt after"}:{" "}
          {new Date(job.availableAt).toLocaleString(uk ? "uk-UA" : "en-GB")}
        </Text>
      )}
    </>
  );
}
