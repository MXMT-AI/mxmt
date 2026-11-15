import { Button } from "@/components/ui/button/button";
import { control } from "@/components/ui/control-styles/control-styles";
import type { ReorderingCopy } from "@/lib/reordering-copy";
import type { ReorderingPreview } from "../reordering-editor/reordering-editor";

export function ReorderingTransitCell({ row, value, edited, invalid, copy, onTransit, onRestore }: {
  row: ReorderingPreview["rows"][number];
  value: string | undefined;
  edited: boolean;
  invalid: boolean;
  copy: ReorderingCopy;
  onTransit: (skuId: string, value: string) => void;
  onRestore: (skuId: string) => void;
}) {
  const editable = row.shortageEligible && row.state !== "EXCLUDED";
  const id = `transit-error-${row.skuId}`;
  return (
    <div className="w-40 space-y-1">
      <input
        className={control + " text-right tabular-nums"}
        aria-label={`${copy.transit}: ${row.name}`}
        aria-invalid={invalid}
        aria-describedby={invalid ? id : undefined}
        name={`transit-${row.skuId}`}
        inputMode="decimal"
        autoComplete="off"
        value={value ?? row.inTransitQuantity ?? ""}
        placeholder={copy.unknown + "…"}
        disabled={!editable}
        onChange={(e) => onTransit(row.skuId, e.target.value)}
      />
      {edited ? (
        <>
          <small className="block whitespace-normal">
            {value === ""
              ? copy.clearedTransit
              : copy.confirmed}
          </small>
          <button
            className="min-h-11 text-xs underline underline-offset-2"
            type="button"
            onClick={() => onRestore(row.skuId)}
          >
            {copy.restore}
          </button>
        </>
      ) : row.inTransitQuantity === null && editable ? (
        <Button
          variant="report"
          className="text-xs"
          onClick={() => onTransit(row.skuId, "0")}
        >
          {copy.confirmZero}
        </Button>
      ) : null}
      {invalid ? (
        <p
          id={id}
          className={"text-report-negative text-xs whitespace-normal"}
        >
          {copy.transitError}
        </p>
      ) : null}
    </div>
  );
}
