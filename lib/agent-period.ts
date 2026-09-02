export const AGENT_PERIOD_STORAGE_KEY = "mxmt_agent_period_v1";

export interface StoredAgentPeriod {
  analysisDate: string;
  dateFrom: string;
}

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

function isCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_KEY.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function parseStoredAgentPeriod(
  raw: string | null,
  today: string
): StoredAgentPeriod | null {
  if (!raw || !isCalendarDate(today)) return null;

  try {
    const value = JSON.parse(raw) as Partial<StoredAgentPeriod>;
    if (!isCalendarDate(value.analysisDate) || value.analysisDate > today) return null;

    const dateFrom = value.dateFrom ?? "";
    if (dateFrom !== "" && (!isCalendarDate(dateFrom) || dateFrom >= value.analysisDate)) {
      return null;
    }

    return { analysisDate: value.analysisDate, dateFrom };
  } catch {
    return null;
  }
}
