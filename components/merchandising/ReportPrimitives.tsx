"use client";
import Link from "next/link";
import type { ReactNode } from "react";
type Href = (values: Record<string, string | null>) => string;
export const panel =
  "min-w-0 rounded-xl border border-(--border) bg-(--surface)";
export const button =
  "inline-flex min-h-11 touch-manipulation items-center justify-center rounded-lg border border-(--border) px-4 py-2 text-sm hover:bg-(--input-bg) focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2";
/** Render supporting context consistently across merchandising reports. */
export function Note({ children }: { children: ReactNode }) {
  return (
    <p className="text-xs leading-relaxed text-(--muted)">{children}</p>
  );
}
/** Keep the visible marker decorative and expose its localized meaning as text. */
export function PartialMarker({ label }: { label: string }) {
  return (
    <>
      <span aria-hidden="true"> *</span>
      <span className="sr-only"> {label}</span>
    </>
  );
}
/** Page one report section without discarding the other URL-owned controls. */
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
