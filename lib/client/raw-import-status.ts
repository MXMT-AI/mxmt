import { RAW_IMPORT_MAX_RUNTIME_MS, rawImportIsLive } from "@/lib/data-import-policy";

/** Schedule one status check, or a local expiry update when the claim expires first. */
export function scheduleRawImportStatusCheck(
  run: { status: string; createdAt: string } | null,
  poll: () => void,
  expired: () => void,
) {
  if (!run || !rawImportIsLive(run)) return () => {};
  const remaining = Date.parse(run.createdAt) + RAW_IMPORT_MAX_RUNTIME_MS - Date.now();
  const timer = setTimeout(() => {
    if (rawImportIsLive(run)) poll();
    else expired();
  }, Math.min(10000, Math.max(0, remaining)));
  return () => clearTimeout(timer);
}
