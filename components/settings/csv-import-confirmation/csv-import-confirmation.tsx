import { Button } from "@/components/ui/button/button";
import type { Lang } from "@/lib/translations";
import { csvImportCopy } from "../csv-import-card/copy";

export function CsvImportConfirmation({ approved, busy, hasFiles, lang, onApprove }: {
  approved: boolean;
  busy: boolean;
  hasFiles: boolean;
  lang: Lang;
  onApprove: (approved: boolean) => void;
}) {
  const copy = csvImportCopy[lang];
  return (
    <>
      <label className="flex items-start gap-2 text-sm text-(--text)">
        <input type="checkbox" required checked={approved} onChange={event => onApprove(event.target.checked)} />
        {copy.approval}
      </label>
      <Button
        variant="report"
        type="submit"
        disabled={busy || !hasFiles || !approved}
        className="justify-start text-(--text) hover:border-(--muted) hover:bg-transparent"
      >
        {busy ? copy.processing : copy.preview}
      </Button>
    </>
  );
}
