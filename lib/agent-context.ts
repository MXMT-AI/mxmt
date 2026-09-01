export interface AgentRunContext {
  importRunId: string | null;
  asOf: string;
  dateFrom: string | null;
}

function kyivDateKey(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Kyiv",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: "year" | "month" | "day") => parts.find((part) => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function dateKey(value: unknown, fallback: Date): string {
  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  }
  return kyivDateKey(fallback);
}

export function buildAgentRunContext(
  input: { importRunId?: unknown; asOf?: unknown; dateFrom?: unknown },
  now = new Date()
): AgentRunContext {
  return {
    importRunId: typeof input.importRunId === "string" ? input.importRunId : null,
    asOf: dateKey(input.asOf, now),
    dateFrom:
      typeof input.dateFrom === "string" && input.dateFrom.trim()
        ? dateKey(input.dateFrom, now)
        : null,
  };
}

export function isAgentRunCurrent(
  run: { input: unknown },
  context: AgentRunContext
): boolean {
  if (!run.input || typeof run.input !== "object" || Array.isArray(run.input)) return false;
  const input = run.input as Record<string, unknown>;
  return (
    input.importRunId === context.importRunId &&
    input.asOf === context.asOf &&
    (input.dateFrom ?? null) === context.dateFrom
  );
}

export function selectCurrentDependencyRun<TRun extends { status: string; input: unknown }>(
  runs: TRun[],
  context: AgentRunContext
): { run: TRun | null; ready: boolean; reason: "missing" | "stale" | "running" | "error" | null } {
  const current = runs.find((run) => isAgentRunCurrent(run, context));
  if (!current) {
    return { run: null, ready: false, reason: runs.length > 0 ? "stale" : "missing" };
  }
  if (current.status !== "done") {
    return {
      run: current,
      ready: false,
      reason: current.status === "running" ? "running" : "error",
    };
  }
  return { run: current, ready: true, reason: null };
}
