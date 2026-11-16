import { Link } from "@/i18n/navigation";
import { control } from "@/components/ui/control-styles/control-styles";
import { qualityLabel, qualityGuidance, qualityFixHref } from "@/lib/data-quality-copy";
import type { Lang } from "@/lib/translations";
import type { QualityProduct } from "../data-quality-card/data-quality-types";
import { productKindLabel } from "../data-quality-card/data-quality-labels";

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
            ? "Без бренду"
            : "Unbranded"
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
                {uk ? "Де виправити" : "Where to fix"}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {row.ageReference.basis === "FIRST_SALE_PROXY" && (
        <p className="mt-2 text-(--muted)">
          {uk
            ? "Перше підтверджене замовлення як орієнтир віку, не дата надходження:"
            : "First verified sale as an age proxy, not a receipt date:"}{" "}
          {row.ageReference.date &&
            new Date(row.ageReference.date).toLocaleDateString(
              locale,
            )}
        </p>
      )}
      {canManage ? (
        <label className="mt-2 flex flex-wrap items-center gap-2 text-(--muted)">
          {uk ? "Тип товару" : "Product type"}
          <select
            aria-label={`${uk ? "Тип товару" : "Product type"} ${row.sku}`}
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
          {uk ? "Походження даних" : "Data lineage"}
        </summary>
        <p className="mt-1 break-all">
          {uk ? "Джерело" : "Source"}: {row.sourceId}
          <br />
          {uk ? "Спостереження" : "Observed"}:{" "}
          {row.observedAt ? new Date(row.observedAt).toLocaleString(locale) : (uk ? "Не підтверджено" : "Unverified")}
          <br />
          {uk ? "Імпорт" : "Import"}: {row.importRunId}
          <br />
          {uk ? "Запис джерела" : "Source record"}:{" "}
          {row.sourceRecordKey}
        </p>
      </details>
    </article>
  );
}
