import { CHAT_TOPICS, type ChatTopic, type MerchandisingChatRequest } from "@/lib/merchandising-chat-contract";

const filterKeys = ["brandId", "categoryId", "skuId", "channelId", "currency", "classification", "ownership", "supplierId", "search"] as const;

export function readOverviewChatParams(params: Pick<URLSearchParams, "get">, snapshotId: string) {
  const filters: NonNullable<MerchandisingChatRequest["filters"]> = {};
  for (const key of filterKeys) {
    const value = params.get(key);
    if (value !== null) filters[key] = value;
  }
  const topic = params.get("chatTopic");
  const initialTopic = CHAT_TOPICS.includes(topic as ChatTopic) ? topic as ChatTopic : undefined;
  const exportId = params.get("chatExportId");
  return {
    filters,
    initialTopic,
    scenarioExportId: exportId ?? undefined,
    scope: JSON.stringify([snapshotId, filters, initialTopic, exportId]),
  };
}
