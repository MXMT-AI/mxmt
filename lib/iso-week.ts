export function isoWeek(input: Date, calendar: "local" | "utc") {
  const date = calendar === "utc"
    ? new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate()))
    : new Date(Date.UTC(input.getFullYear(), input.getMonth(), input.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const year = date.getUTCFullYear();
  const yearStart = Date.UTC(year, 0, 1);
  const week = Math.ceil(((date.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return { year, week };
}
