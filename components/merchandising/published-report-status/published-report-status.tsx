import type { Lang } from "@/lib/translations";

export function PublishedReportStatus({ publishedAt, busy, lang }: {
  publishedAt?: string;
  busy: boolean;
  lang: Lang;
}) {
  const uk = lang === "uk";
  return (
    <p className="text-sm text-(--muted) empty:sr-only" role="status">
      {busy
        ? uk ? "Оновлюємо дані. Показано попередній зріз." : "Refreshing data. Showing the previous snapshot."
        : publishedAt
          ? <>
              {uk ? "Зріз опубліковано " : "Snapshot published "}
              <time dateTime={publishedAt}>
                {new Intl.DateTimeFormat(uk ? "uk-UA" : "en-GB", {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone: "Europe/Kyiv",
                }).format(new Date(publishedAt))}
              </time>
            </>
          : null}
    </p>
  );
}
