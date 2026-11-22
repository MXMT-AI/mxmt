import { Text } from "@/components/ui/text/text";
import type { Lang } from "@/lib/translations";
import type { Progress } from "../sales-drive-import-card/import-types";
import { issueLabel, errorLabel } from "../sales-drive-import-card/copy";
import { settingsImportJobDetailsMessages as englishCopy } from "@/messages/en.json";
import { settingsImportJobDetailsMessages as ukrainianCopy } from "@/messages/uk.json";

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
                [uk ? ukrainianCopy.receipts : englishCopy.receipts, job.stats.receipts],
                [uk ? ukrainianCopy.products : englishCopy.products, job.stats.products],
                [uk ? ukrainianCopy.snapshots : englishCopy.snapshots, job.stats.snapshots],
                [uk ? ukrainianCopy.priceChanges : englishCopy.priceChanges, job.stats.prices],
              ]
            : [
                [uk ? ukrainianCopy.pages : englishCopy.pages, job.stats.pages],
                [uk ? ukrainianCopy.orders : englishCopy.orders, job.stats.orders],
                [uk ? ukrainianCopy.imported : englishCopy.imported, job.stats.imported],
                [uk ? ukrainianCopy.duplicates : englishCopy.duplicates, job.stats.duplicate],
                [uk ? ukrainianCopy.stale : englishCopy.stale, job.stats.stale],
                [
                  uk ? ukrainianCopy.quarantined : englishCopy.quarantined,
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
            ? ukrainianCopy.dataQualityWarningsExistReview
            : englishCopy.dataQualityWarningsExistReview}
        </Text>
      )}
      {job.issues?.length > 0 && (
        <details className="mt-3 text-sm text-(--text)">
          <summary className="cursor-pointer">
            {uk ? ukrainianCopy.dataQualityWarnings : englishCopy.dataQualityWarnings}
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
          {uk ? ukrainianCopy.reason : englishCopy.reason}: {errorLabel(job.errorCode, uk,generic)}
        </Text>
      )}
      {job.state === "RETRY" && (
        <Text variant="body" className="leading-normal mt-2 text-sm text-(--muted)">
          {uk ? ukrainianCopy.nextAttemptAfter : englishCopy.nextAttemptAfter}:{" "}
          {new Date(job.availableAt).toLocaleString(uk ? "uk-UA" : "en-GB")}
        </Text>
      )}
    </>
  );
}
