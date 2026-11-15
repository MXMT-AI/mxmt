import type { RepricingCopy } from "@/lib/repricing-copy";
import type { RepricingPreview } from "../use-repricing-preview";

export function RepricingProductCell({ row, copy, monobrand }: {
  row: RepricingPreview["rows"][number];
  copy: RepricingCopy;
  monobrand: boolean;
}) {
  return (
    <div className="min-w-52 max-w-72 whitespace-normal wrap-break-word">
      <strong className="font-semibold">{row.name}</strong>{" "}
      <span
        className={
          row.classification === "RISK"
            ? "text-report-warning"
            : "text-report-negative"
        }
      >
        {row.classification === "RISK"
          ? copy.statuses.RISK
          : copy.statuses.DEAD}
      </span>
      <div className="mt-1 text-(--muted)">
        {!monobrand && (
          <>
            <span translate="no">
              {row.brandName ?? copy.unassigned}
            </span>{" "}
            ·{" "}
          </>
        )}
        {row.categoryName ?? copy.unassigned}
        <br />
        <span translate="no">{row.sku}</span>
      </div>
      {row.ownership === "CONSIGNMENT" ? (
        <p className={"text-report-warning"}>{copy.consignment}</p>
      ) : !row.eligible ? (
        <p>{copy.unavailable}</p>
      ) : null}
    </div>
  );
}
