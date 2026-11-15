import { overviewCopy } from "./overview-copy";
import type { Lang } from "./translations";

const labelKeys = {
  FRESH: "fresh",
  HISTORICAL: "historical",
  STALE: "stale",
  SOURCE_CHANGED: "changed",
  SYNCING: "syncing",
  SOURCE_UNAVAILABLE: "sourceUnavailable",
} as const;

export function freshnessLabel(status: string, lang: Lang) {
  if (!Object.hasOwn(labelKeys, status)) return undefined;
  return overviewCopy[lang][labelKeys[status as keyof typeof labelKeys]];
}
