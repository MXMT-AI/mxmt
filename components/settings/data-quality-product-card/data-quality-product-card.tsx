import { Link } from "@/i18n/navigation";
import { control } from "@/components/ui/control-styles/control-styles";
import { qualityLabel, qualityGuidance, qualityFixHref } from "@/lib/data-quality-copy";
import type { Lang } from "@/lib/translations";
import type { QualityProduct } from "../data-quality-card/data-quality-types";
import { productKindLabel } from "../data-quality-card/data-quality-labels";
import { settingsDataQualityProductCardMessages as englishCopy } from "@/messages/en.json";
import { settingsDataQualityProductCardMessages as ukrainianCopy } from "@/messages/uk.json";

export function DataQualityProductCard({ row, lang, canManage, disabled, onKindChange }: {
  row: QualityProduct;
  lang: Lang;
  canManage: boolean;
  disabled: boolean;
  onKindChange: (skuId: string, kind: string) => void | Promise<void>;
}) {
  const uk = lang === "uk";
  const locale = uk ? "uk-UA" : "en-GB";
  const label = (code: string) => qualityLabel(code, lang);
  const kindLabel = (kind: string) => productKindLabel(kind, lang);
  return (
    <article
      className="border-t border-(--border) pt-3 text-sm"
    >
      <p className="wrap-break-word font-medium text-(--text)">
        {row.name} · <span translate="no">{row.sku}</span>
      </p>
      <p className="mt-1 text-(--muted)">
        {row.brandKey === "UNBRANDED"
          ? uk
            ? ukrainianCopy.unbranded
            : englishCopy.unbranded
          : row.brandKey}
      </p>
      {row.issues.length > 0 && (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-(--muted)">
          {row.issues.map((code) => (
            <li key={code}>
              {label(code)}
              <p>{qualityGuidance(code, lang)}</p>
              <Link
                className="inline-flex min-h-11 items-center underline focus-visible:outline-solid"
                href={qualityFixHref(code)}
              >
                {uk ? ukrainianCopy.whereToFix : englishCopy.whereToFix}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {row.ageReference.basis === "FIRST_SALE_PROXY" && (
        <p className="mt-2 text-(--muted)">
          {uk
            ? ukrainianCopy.firstVerifiedSaleAsAn
            : englishCopy.firstVerifiedSaleAsAn}{" "}
          {row.ageReference.date &&
            new Date(row.ageReference.date).toLocaleDateString(
              locale,
            )}
        </p>
      )}
      {canManage ? (
        <label className="mt-2 flex flex-wrap items-center gap-2 text-(--muted)">
          {uk ? ukrainianCopy.productType : englishCopy.productType}
          <select
            aria-label={`${uk ? ukrainianCopy.productType : englishCopy.productType} ${row.sku}`}
            value={row.productKind}
            disabled={disabled}
            onChange={(e) =>
              onKindChange(row.id, e.target.value)
            }
            className={control + " min-h-0 focus-visible:outline-(--text)"}
          >
            {["UNKNOWN", "MERCHANDISE", "SERVICE", "GIFT_CARD"].map(
              (kind) => (
                <option key={kind} value={kind}>
                  {kindLabel(kind)}
                </option>
              ),
            )}
          </select>
        </label>
      ) : (
        <p className="mt-2 text-(--muted)">
          {kindLabel(row.productKind)}
        </p>
      )}
      <details className="mt-2 text-(--muted)">
        <summary className="cursor-pointer focus-visible:outline-solid">
          {uk ? ukrainianCopy.dataLineage : englishCopy.dataLineage}
        </summary>
        <p className="mt-1 break-all">
          {uk ? ukrainianCopy.source : englishCopy.source}: {row.sourceId}
          <br />
          {uk ? ukrainianCopy.observed : englishCopy.observed}:{" "}
          {row.observedAt ? new Date(row.observedAt).toLocaleString(locale) : (uk ? ukrainianCopy.unverified : englishCopy.unverified)}
          <br />
          {uk ? ukrainianCopy.import : englishCopy.import}: {row.importRunId}
          <br />
          {uk ? ukrainianCopy.sourceRecord : englishCopy.sourceRecord}:{" "}
          {row.sourceRecordKey}
        </p>
      </details>
    </article>
  );
}
