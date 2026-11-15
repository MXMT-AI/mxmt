import type { BrandStatus } from "./agents.types";

const brandStatuses = {
  critical: { color: "var(--danger-ink)", label: "КРИТИЧНО" },
  warning: { color: "var(--amber-ink)", label: "ПОПЕРЕДЖЕННЯ" },
  excellent: { color: "var(--cyan-ink)", label: "ВІДМІННО" },
  balanced: { color: "var(--muted)", label: "НОРМА" },
} satisfies Record<BrandStatus, { color: string; label: string }>;

export function getBrandStatus(status?: string) {
  return status && Object.hasOwn(brandStatuses, status)
    ? brandStatuses[status as BrandStatus]
    : brandStatuses.balanced;
}
