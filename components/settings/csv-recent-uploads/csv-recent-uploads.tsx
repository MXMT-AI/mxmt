import { Button } from "@/components/ui/button/button";
import type { Lang } from "@/lib/translations";
import type { CsvPreview } from "../csv-import-card/csv-import-types";

export function CsvRecentUploads({ uploads, busy, lang, onOpen }: {
  uploads: Array<Pick<CsvPreview, "id" | "state" | "contentHash">>;
  busy: boolean;
  lang: Lang;
  onOpen: (id: string) => void | Promise<void>;
}) {
  if (!uploads.length) return null;
  return (
    <details className="text-sm text-(--muted)">
      <summary className="cursor-pointer">{lang === "uk" ? "Останні пакети" : "Recent packets"}</summary>
      <ul className="mt-3 space-y-2">
        {uploads.map(upload => (
          <li key={upload.id}>
            <Button
              variant="report"
              disabled={busy}
              className="justify-start text-(--text) hover:border-(--muted) hover:bg-transparent"
              onClick={() => void onOpen(upload.id)}
            >
              {upload.state} · {upload.contentHash.slice(0, 12)}
            </Button>
          </li>
        ))}
      </ul>
    </details>
  );
}
