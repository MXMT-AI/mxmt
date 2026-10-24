import { createHash } from "node:crypto";
import type { ClientMerchandisingSettings } from "./merchandising-settings";
import type { OrderPolicy } from "./connectors/order-normalization";
/** Explicitly confirmed client status lists override sale mappings; source amount evidence remains separate. */
export function applyClientOrderSettings(
  source: OrderPolicy,
  client: ClientMerchandisingSettings,
  config: { id: string; revision: number },
): OrderPolicy {
  const statuses = { ...source.statuses };
  if (client.saleStatusesVerified) {
    for (const [id, kind] of Object.entries(statuses))
      if (kind === "SALE") delete statuses[id];
    for (const id of client.saleStatuses) statuses[id] = "SALE";
  }
  return {
    ...source,
    statuses,
    settings: {
      configId: config.id,
      revision: config.revision,
      filterFingerprint: clientOrderFilterFingerprint(client),
      excludedChannels: [...client.excludedChannels],
      excludedProjects: [...client.excludedProjects],
      projectField: client.projectField,
    },
  };
}

/** Plan/threshold edits do not invalidate order projections; only effective ingestion filters do. */
export function clientOrderFilterFingerprint(
  client: ClientMerchandisingSettings,
) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        statuses: client.saleStatusesVerified
          ? [...client.saleStatuses].sort()
          : null,
        channels: [...client.excludedChannels].sort(),
        projects: [...client.excludedProjects].sort(),
        projectField: client.excludedProjects.length
          ? client.projectField
          : null,
      }),
    )
    .digest("hex");
}
