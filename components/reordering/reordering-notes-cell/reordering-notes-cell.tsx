import { Note } from "@/components/ui/note/note";
import { reorderingIssue, type ReorderingCopy } from "@/lib/reordering-copy";
import type { ReorderingPreview } from "../reordering-editor/reordering-editor";

export function ReorderingNotesCell({ row, copy }: {
  row: ReorderingPreview["rows"][number];
  copy: ReorderingCopy;
}) {
  const exclusions = row.exclusionReasons.map((r) =>
    r === "OFF_SEASON"
      ? copy.offSeason
      : r === "NEW_PRODUCT_QUARANTINE"
        ? copy.new
        : r === "INACTIVE"
          ? copy.inactive
          : copy.service,
  );
  return (
    <div className="min-w-48 max-w-80 space-y-1 whitespace-normal wrap-break-word">
      {row.urgency === "RED" ? (
        <p className={"text-report-negative"}>{copy.urgent}</p>
      ) : null}
      {exclusions.map((note) => (
        <p key={note}>{note}</p>
      ))}
      {row.issues.length ? (
        <details>
          <summary className="min-h-11 cursor-pointer py-2">
            {copy.review} ({row.issues.length})
          </summary>
          {row.issues.map((code) => (
            <p key={code}>{reorderingIssue(copy, code)}</p>
          ))}
        </details>
      ) : null}
      {row.state === "ZERO_DEMAND" ? <p>{copy.noDemand}</p> : null}
      {row.warnings.includes("RECEIPT_DATE_VELOCITY_FALLBACK") ? (
        <p>{copy.fallback}</p>
      ) : null}
      <Note>
        {copy.terms}: {row.leadDays ?? "—"} / {row.coverDays ?? "—"}{" "}
        {copy.days} · {copy.moq}: {row.moq ?? "—"}
      </Note>
    </div>
  );
}
