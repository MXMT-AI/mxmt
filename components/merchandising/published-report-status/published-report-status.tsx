import type { Lang } from "@/lib/translations";
import { merchandisingPublishedReportStatusMessages as englishCopy } from "@/messages/en.json";
import { merchandisingPublishedReportStatusMessages as ukrainianCopy } from "@/messages/uk.json";

export function PublishedReportStatus({ publishedAt, busy, lang }: {
  publishedAt?: string;
  busy: boolean;
  lang: Lang;
}) {
  const uk = lang === "uk";
  return (
    <p className="text-sm text-(--muted) empty:sr-only" role="status">
      {busy
        ? uk ? ukrainianCopy.refreshingDataShowingThePrevious : englishCopy.refreshingDataShowingThePrevious
        : publishedAt
          ? <>
              {uk ? ukrainianCopy.snapshotPublished : englishCopy.snapshotPublished}
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
