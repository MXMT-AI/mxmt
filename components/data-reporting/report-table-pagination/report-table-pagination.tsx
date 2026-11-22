import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button/button";
import { reportPaginationCopy as reportPaginationCopyEn } from "@/messages/en.json";
import { reportPaginationCopy as reportPaginationCopyUk } from "@/messages/uk.json";

const buttonClassName = "size-8 p-0 inline-flex items-center justify-center hover:bg-(--input-hover) disabled:opacity-35";

export const reportPaginationCopy = { uk: reportPaginationCopyUk, en: reportPaginationCopyEn };

export function ReportTablePagination({ pagination, requestedPage, locale, copy, onPrevious, onNext }: {
  pagination: { page: number; totalPages: number; totalRows: number };
  requestedPage: number;
  locale: string;
  copy: { records: string; previous: string; next: string; page: string; of: string };
  onPrevious: () => void;
  onNext: () => void;
}) {
  return (
    <footer className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-3 border-t border-(--border) text-xs text-(--muted)">
      <span>{pagination.totalRows.toLocaleString(locale)} {copy.records}</span>
      <nav aria-label={copy.page} className="flex items-center gap-2">
        <Button aria-label={copy.previous} title={copy.previous} disabled={requestedPage <= 1} onClick={onPrevious} className={buttonClassName}>
          <ChevronLeft size={14} aria-hidden="true" />
        </Button>
        <span className="min-w-28 text-center">{copy.page} {pagination.page} {copy.of} {Math.max(1, pagination.totalPages)}</span>
        <Button aria-label={copy.next} title={copy.next} disabled={pagination.totalPages === 0 || requestedPage >= pagination.totalPages} onClick={onNext} className={buttonClassName}>
          <ChevronRight size={14} aria-hidden="true" />
        </Button>
      </nav>
    </footer>
  );
}
