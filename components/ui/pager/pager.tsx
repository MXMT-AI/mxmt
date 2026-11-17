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
  const { page, totalPages } = pagination;
  if (totalPages <= 1 && page <= 1) return null;

  const lastPage = Math.max(1, totalPages);
  const pageLink = (target: number, label: string) => (
    <Link className={button} href={href({ [control]: String(target) })}>
      {label}
    </Link>
  );

  return (
    <nav
      aria-label={copy.page}
      className="flex flex-wrap items-center gap-3 border-t border-(--border) p-3 text-xs"
    >
      {page > 1 ? pageLink(Math.min(page - 1, lastPage), copy.previous) : null}
      <span>
        {copy.page} {page} / {lastPage}
      </span>
      {page < totalPages ? pageLink(page + 1, copy.next) : null}
    </nav>
  );
}
