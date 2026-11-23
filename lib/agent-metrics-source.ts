import { readPublishedAgentData } from "./published-agent-data";

type PublishedAgentData = NonNullable<Awaited<ReturnType<typeof readPublishedAgentData>>>;

export async function loadAgentMetricRows<PublishedRows, LiveRows>(
  tenantId: string,
  importRunId: string,
  from: Date,
  until: Date | undefined,
  selectPublished: (data: PublishedAgentData) => PublishedRows,
  readLive: (scope: {
    importScope: { tenantId: string; importRunId: string };
    saleScope: {
      tenantId: string;
      importRunId: string;
      paymentDate: { gte: Date; lte?: Date };
      resolvedProductId: { not: null };
      normalizedQuantity: { not: null };
    };
  }) => Promise<LiveRows>,
): Promise<PublishedRows | LiveRows> {
  const published = await readPublishedAgentData(tenantId, importRunId, from, until);
  if (published) return selectPublished(published);

  const importScope = { tenantId, importRunId };
  return readLive({
    importScope,
    saleScope: {
      ...importScope,
      paymentDate: { gte: from, ...(until ? { lte: until } : {}) },
      resolvedProductId: { not: null },
      normalizedQuantity: { not: null },
    },
  });
}
