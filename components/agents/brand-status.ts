import type { BrandStatus } from "./agents.types";
import { agentsBrandStatusMessages as ukrainianCopy } from "@/messages/uk.json";

const brandStatuses = {
  critical: { color: "var(--danger-ink)", label: ukrainianCopy.labelКРИТИЧНО },
  warning: { color: "var(--amber-ink)", label: ukrainianCopy.labelПОПЕРЕДЖЕННЯ },
  excellent: { color: "var(--cyan-ink)", label: ukrainianCopy.labelВІДМІННО },
  balanced: { color: "var(--muted)", label: ukrainianCopy.labelНОРМА },
} satisfies Record<BrandStatus, { color: string; label: string }>;

export function getBrandStatus(status?: string) {
  return status && Object.hasOwn(brandStatuses, status)
    ? brandStatuses[status as BrandStatus]
    : brandStatuses.balanced;
}
