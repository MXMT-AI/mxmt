import { Note } from "@/components/ui/note/note";

export function ScenarioSnapshotNote({ asOf, locale, copy }: {
  asOf: string;
  locale: string;
  copy: { allChannels: string; asOf: string };
}) {
  const snapshotDate = new Intl.DateTimeFormat(locale, { timeZone: "UTC" })
    .format(new Date(`${asOf}T00:00:00Z`));

  return (
    <Note>
      {copy.allChannels} · {copy.asOf}:{" "}
      <time dateTime={asOf}>{snapshotDate}</time>
    </Note>
  );
}
