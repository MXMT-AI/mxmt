export function stockHistoryFormatters(locale: string) {
  const date = new Intl.DateTimeFormat(locale, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
  const time = new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short", timeZone: "UTC" });
  return {
    date: (value: string) => date.format(new Date(`${value}T12:00:00Z`)),
    time: (value: string | null) => value ? `${time.format(new Date(value))} UTC` : "—",
  };
}
