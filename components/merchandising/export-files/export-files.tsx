"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button/button";
import { exportCopy } from "@/lib/scenario-export-client";
import type { ScenarioExportReceipt } from "@/lib/scenario-export-contract";
import type { Lang } from "@/lib/translations";

export function ExportFiles({
  receipt,
  lang,
}: {
  receipt: ScenarioExportReceipt;
  lang: Lang;
}) {
  const [page, setPage] = useState(1),
    copy = exportCopy[lang],
    pageSize = 10,
    pages = Math.ceil(receipt.files.length / pageSize);
  return (
    <div className="space-y-2">
      <ul className="space-y-2">
        {receipt.files
          .slice((page - 1) * pageSize, page * pageSize)
          .map((file) => (
            <li key={file.id} className="min-w-0 text-sm">
              <a
                className="underline underline-offset-4 break-all focus-visible:outline-solid focus-visible:outline-2"
                href={file.url}
                download={file.name}
              >
                {copy.download}: {file.name}
              </a>
              <span className="ml-2 text-xs text-(--muted)">
                {file.rowCount} {copy.rows} · {file.currency}
              </span>
            </li>
          ))}
      </ul>
      {pages > 1 ? (
        <nav
          aria-label={copy.files}
          className="flex items-center gap-3 text-xs"
        >
          <Button
            variant="report"
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            {copy.previous}
          </Button>
          <span>
            {copy.page} {page} / {pages}
          </span>
          <Button
            variant="report"
            type="button"
            disabled={page >= pages}
            onClick={() => setPage((p) => p + 1)}
          >
            {copy.next}
          </Button>
        </nav>
      ) : null}
    </div>
  );
}
