"use client";

import { Button } from "@/components/ui/button/button";
import { Note } from "@/components/ui/note/note";
import { exportCopy, exportKindLabel } from "@/lib/scenario-export-client";
import type { ScenarioExportReceipt } from "@/lib/scenario-export-contract";
import type { Lang } from "@/lib/translations";
import { ExportFiles } from "../export-files/export-files";

export function ExportHistory({ history, error, onRetry, allowed, lang }: {
  history: ScenarioExportReceipt[];
  error: boolean;
  onRetry: () => void;
  allowed: boolean;
  lang: Lang;
}) {
  const copy = exportCopy[lang];
  const date = new Intl.DateTimeFormat(lang === "uk" ? "uk-UA" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <details>
      <summary className="min-h-11 cursor-pointer py-2 font-semibold">{copy.history}</summary>
      {error ? (
        <div role="alert">
          <p>{copy.historyError}</p>
          <Button variant="report" onClick={onRetry}>{copy.retry}</Button>
        </div>
      ) : !history.length ? (
        <p className="text-sm">{copy.empty}</p>
      ) : (
        <ol className="space-y-4">
          {history.map(receipt => (
            <li key={receipt.exportId} className="border-t border-(--border) pt-3 space-y-2">
              <p className="text-sm">
                {exportKindLabel(receipt.kind, lang)} ·{" "}
                <time dateTime={receipt.createdAt}>{date.format(new Date(receipt.createdAt))}</time>
              </p>
              <Note>{copy.actor}: {receipt.actorId} · {copy.files}: {receipt.files.length}</Note>
              {allowed ? <ExportFiles receipt={receipt} lang={lang} /> : null}
            </li>
          ))}
        </ol>
      )}
    </details>
  );
}
