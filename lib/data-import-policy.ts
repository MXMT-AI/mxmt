/** Hard execution window exceeds the 300-second hosting request budget. */
export const RAW_IMPORT_MAX_RUNTIME_MS = 10 * 60 * 1000;
/** A stale claim is retryable; it is not evidence of a successful import. */
export function rawImportIsLive(run: { status: string; createdAt: string } | null, now = Date.now()) {
  if (run?.status !== "RUNNING") return false;
  const startedAt = Date.parse(run.createdAt);
  return Number.isFinite(startedAt) && now - startedAt < RAW_IMPORT_MAX_RUNTIME_MS;
}
