import { Link } from "@/i18n/navigation";
import { button } from "../button/button-styles";

type Href = (values: Record<string, string | null>) => string;

export function Pager({
  pagination,
  control,
  href,
  copy,
}: {
  pagination: {
    page: number;
    pageSize: number;
    totalRows: number;
    totalPages: number;
  };
  control: string;
  href: Href;
  copy: { page: string; previous: string; next: string };
}) {
  if (pagination.totalPages <= 1 && pagination.page <= 1) return null;
  return (
    <nav
      aria-label={copy.page}
      className="flex flex-wrap items-center gap-3 border-t border-(--border) p-3 text-xs"
    >
      {pagination.page > 1 ? (
        <Link
          className={button}
          href={href({
            [control]: String(
              Math.min(pagination.page - 1, Math.max(1, pagination.totalPages)),
            ),
          })}
        >
          {copy.previous}
        </Link>
      ) : null}
      <span>
        {copy.page} {pagination.page} / {Math.max(1, pagination.totalPages)}
      </span>
      {pagination.page < pagination.totalPages ? (
        <Link
          className={button}
          href={href({ [control]: String(pagination.page + 1) })}
        >
          {copy.next}
        </Link>
      ) : null}
    </nav>
  );
}
