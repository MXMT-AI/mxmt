import type { Lang } from "@/lib/translations";
import type { ChatTopic, MerchandisingChatRequest } from "@/lib/merchandising-chat-contract";

export interface MerchandisingChatProps {
  snapshotId: string;
  filters: MerchandisingChatRequest["filters"];
  lang: Lang;
  allowed: boolean;
  initialTopic?: ChatTopic;
  scenarioExportId?: string;
}

export type ChatThreadProps = Omit<MerchandisingChatProps, "initialTopic"> & { topic: ChatTopic };
