import { control } from "@/components/ui/control-styles/control-styles";
import type { RepricingCopy } from "@/lib/repricing-copy";
import type { RepricingPreview } from "../use-repricing-preview";

export function RepricingPriceCell({ row, value, edited, invalid, copy, canEdit, onPrice }: {
  row: RepricingPreview["rows"][number];
  value: string | undefined;
  edited: boolean;
  invalid: boolean;
  copy: RepricingCopy;
  canEdit: boolean;
  onPrice: (skuId: string, price: string | null) => void;
}) {
  const errorId = `repricing-price-${row.skuId}`;
  return (
    <div className="w-36">
      <input
        aria-label={`${copy.newPrice}: ${row.name}`}
        aria-invalid={invalid}
        aria-describedby={invalid ? errorId : undefined}
        className={control + " text-right tabular-nums"}
        name={`price-${row.skuId}`}
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        value={value ?? row.newPrice ?? ""}
        disabled={!row.eligible || !canEdit}
        onChange={(e) => onPrice(row.skuId, e.target.value)}
      />
      {edited ? (
        <>
          <small className="block mt-1">{copy.manual}</small>
          <button
            type="button"
            className="min-h-11 text-xs underline underline-offset-2"
            disabled={!canEdit}
            onClick={() => onPrice(row.skuId, null)}
          >
            {copy.restore}
          </button>
        </>
      ) : null}
      {invalid ? (
        <p
          id={errorId}
          className={"text-report-negative mt-1 text-xs whitespace-normal"}
        >
          {copy.manualError}
        </p>
      ) : null}
    </div>
  );
}
